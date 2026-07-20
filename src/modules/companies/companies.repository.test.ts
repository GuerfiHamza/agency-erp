import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { companies, user } from '@/db/schema';

import * as repository from './companies.repository';
import type { UpdateCompanyInput } from './companies.validation';

/**
 * Runs against the real Postgres from docker-compose.
 *
 * The behaviour under test here is almost entirely the database's: partial
 * unique indexes, soft-delete filters, a transaction spanning two tables. A
 * mocked driver would only confirm we called it the way we intended, which is
 * never the part in doubt.
 */

const SLUG = 'vitest-companies-repo';

async function createCompany(slug = SLUG) {
  const [company] = await db.insert(companies).values({ name: 'Vitest Co', slug }).returning();

  if (!company) throw new Error('fixture insert failed');

  return company;
}

/** Fixtures are removed by slug/email prefix so a failed run cannot poison the next. */
async function cleanup() {
  await db.delete(user).where(eq(user.email, 'vitest-member@nexus.test'));
  await db.delete(companies).where(eq(companies.slug, SLUG));
  await db.delete(companies).where(eq(companies.slug, `${SLUG}-2`));
}

beforeEach(cleanup);
afterAll(cleanup);

const profile: UpdateCompanyInput = {
  name: 'Renamed Co',
  legalName: 'Renamed Co SARL',
  taxId: 'FR123',
  registrationNumber: null,
  nif: null,
  articleNumber: null,
  activity: null,
  managerName: null,
  documentReferenceCode: null,
  email: 'billing@nexus.test',
  phone: null,
  website: 'https://nexus.test',
  addressLine1: null,
  addressLine2: null,
  city: 'Paris',
  state: null,
  postalCode: null,
  country: 'FR',
  logoUrl: null,
  defaultCurrency: 'EUR',
  timezone: 'Europe/Paris',
};

describe('findById', () => {
  it('finds a live company', async () => {
    const created = await createCompany();

    expect((await repository.findById(created.id))?.slug).toBe(SLUG);
  });

  it('reports a soft-deleted company as absent', async () => {
    const created = await createCompany();
    await repository.softDelete(created.id);

    expect(await repository.findById(created.id)).toBeNull();
  });

  it('returns null for an id that does not exist', async () => {
    expect(await repository.findById('00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});

describe('update', () => {
  it('writes the profile and leaves the slug alone', async () => {
    const created = await createCompany();
    const updated = await repository.update(created.id, profile);

    expect(updated?.name).toBe('Renamed Co');
    expect(updated?.defaultCurrency).toBe('EUR');
    // Renaming must not re-slug: the old URL is already in someone's bookmarks.
    expect(updated?.slug).toBe(SLUG);
  });

  it('refuses to update a soft-deleted company', async () => {
    const created = await createCompany();
    await repository.softDelete(created.id);

    // The realistic path: a settings form left open in another tab.
    expect(await repository.update(created.id, profile)).toBeNull();
  });
});

describe('softDelete', () => {
  it('deactivates every user in the company', async () => {
    const created = await createCompany();
    await db.insert(user).values({
      name: 'Vitest Member',
      email: 'vitest-member@nexus.test',
      emailVerified: true,
      companyId: created.id,
      isActive: true,
    });

    await repository.softDelete(created.id);

    const member = await db.query.user.findFirst({
      where: eq(user.email, 'vitest-member@nexus.test'),
    });

    // Without this, "deleting" the tenant revokes nothing — live sessions keep
    // working because getSession only rejects on isActive === false.
    expect(member?.isActive).toBe(false);
  });

  it('is not repeatable', async () => {
    const created = await createCompany();

    expect(await repository.softDelete(created.id)).not.toBeNull();
    expect(await repository.softDelete(created.id)).toBeNull();
  });
});

describe('slug uniqueness', () => {
  it('frees the slug once the company is soft-deleted', async () => {
    const first = await createCompany();
    await repository.softDelete(first.id);

    // The partial index is what allows this. A plain unique index would let the
    // dead row squat on the slug forever.
    const second = await createCompany();

    expect(second.id).not.toBe(first.id);
    expect(await repository.findBySlug(SLUG)).not.toBeNull();
  });

  it('rejects two live companies with the same slug', async () => {
    await createCompany();

    await expect(createCompany()).rejects.toThrow();
  });
});

import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { companies } from '@/db/schema';
import { NotFoundError } from '@/lib/errors';

import * as service from './companies.service';
import type { UpdateCompanyInput } from './companies.validation';

/**
 * This file also pins the test harness itself: `companies.service.ts` starts
 * with `import 'server-only'`, which throws outside React's react-server
 * condition. If the alias in vitest.config.ts ever regresses, every test here
 * fails at import — which is the point. See MEMORY.md, "Auth architecture".
 */

const SLUG = 'vitest-companies-service';

const cleanup = () => db.delete(companies).where(eq(companies.slug, SLUG));

beforeEach(cleanup);
afterAll(cleanup);

async function createCompany() {
  const [company] = await db.insert(companies).values({ name: 'Vitest Co', slug: SLUG }).returning();

  if (!company) throw new Error('fixture insert failed');

  return company;
}

const profile: UpdateCompanyInput = {
  name: 'Renamed Co',
  legalName: null,
  taxId: null,
  registrationNumber: null,
  nif: null,
  articleNumber: null,
  activity: null,
  managerName: null,
  documentReferenceCode: null,
  email: null,
  phone: null,
  website: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  postalCode: null,
  country: null,
  logoUrl: null,
  defaultCurrency: 'USD',
  timezone: 'UTC',
};

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('getCompany', () => {
  it('returns the company', async () => {
    const created = await createCompany();

    expect((await service.getCompany(created.id)).slug).toBe(SLUG);
  });

  it('throws NotFoundError when the company is gone', async () => {
    // Not hypothetical: a session outlives its company, so the cookie stays
    // valid while pointing at nothing.
    await expect(service.getCompany(MISSING_ID)).rejects.toThrow(NotFoundError);
  });
});

describe('updateCompany', () => {
  it('applies the profile', async () => {
    const created = await createCompany();

    expect((await service.updateCompany(created.id, profile)).name).toBe('Renamed Co');
  });

  it('throws NotFoundError rather than silently doing nothing', async () => {
    await expect(service.updateCompany(MISSING_ID, profile)).rejects.toThrow(NotFoundError);
  });
});

describe('deleteCompany', () => {
  it('soft-deletes and makes the company unreadable', async () => {
    const created = await createCompany();

    await service.deleteCompany(created.id);

    await expect(service.getCompany(created.id)).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError on a second delete', async () => {
    const created = await createCompany();
    await service.deleteCompany(created.id);

    await expect(service.deleteCompany(created.id)).rejects.toThrow(NotFoundError);
  });
});

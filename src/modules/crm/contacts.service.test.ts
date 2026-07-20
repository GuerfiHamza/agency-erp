import { eq, like, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { clients, companies, contacts } from '@/db/schema';
import { NotFoundError, ValidationError } from '@/lib/errors';

import * as service from './contacts.service';
import type { ContactInput } from './contacts.validation';

/**
 * Against the real Postgres. Pins the one-primary-per-client rule (a partial
 * unique index the service must reconcile, not race), the tenant guard on the
 * client, and cross-tenant scoping.
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG_A = 'vitest-contacts-a';
const SLUG_B = 'vitest-contacts-b';
const CLIENT_NAME = 'vitest-contacts-client';

async function cleanup() {
  await db.delete(clients).where(like(clients.name, `${CLIENT_NAME}%`));
  await db.delete(companies).where(or(eq(companies.slug, SLUG_A), eq(companies.slug, SLUG_B)));
}

beforeEach(cleanup);
afterAll(cleanup);

async function fixture(slug: string) {
  const [company] = await db.insert(companies).values({ name: 'Vitest Co', slug }).returning();
  if (!company) throw new Error('fixture company failed');

  const [client] = await db.insert(clients).values({ companyId: company.id, name: CLIENT_NAME }).returning();
  if (!client) throw new Error('fixture client failed');

  return { company, client };
}

function base(clientId: string, overrides: Partial<ContactInput> = {}): ContactInput {
  return {
    clientId,
    firstName: 'Alex',
    lastName: 'Stone',
    email: null,
    phone: null,
    mobile: null,
    jobTitle: null,
    isPrimary: false,
    notes: null,
    ...overrides,
  };
}

async function primaryCount(clientId: string): Promise<number> {
  const rows = await db.select().from(contacts).where(eq(contacts.clientId, clientId));
  return rows.filter((c) => c.isPrimary && c.deletedAt === null).length;
}

describe('one primary per client', () => {
  it('demotes the previous primary when a second is created', async () => {
    const { company, client } = await fixture(SLUG_A);
    const first = await service.createContact(company.id, base(client.id, { isPrimary: true }));
    await service.createContact(company.id, base(client.id, { firstName: 'Bea', isPrimary: true }));

    expect(await primaryCount(client.id)).toBe(1);
    const firstAfter = await service.getContact(company.id, first.id);
    expect(firstAfter.isPrimary).toBe(false);
  });

  it('demotes the previous primary when one is promoted by update', async () => {
    const { company, client } = await fixture(SLUG_A);
    const first = await service.createContact(company.id, base(client.id, { isPrimary: true }));
    const second = await service.createContact(company.id, base(client.id, { firstName: 'Bea' }));

    await service.updateContact(
      company.id,
      second.id,
      base(client.id, { firstName: 'Bea', isPrimary: true }),
    );

    expect(await primaryCount(client.id)).toBe(1);
    expect((await service.getContact(company.id, first.id)).isPrimary).toBe(false);
  });

  it('frees the primary slot on delete, so another can take it', async () => {
    const { company, client } = await fixture(SLUG_A);
    const first = await service.createContact(company.id, base(client.id, { isPrimary: true }));
    const second = await service.createContact(company.id, base(client.id, { firstName: 'Bea' }));

    await service.deleteContact(company.id, first.id);
    // Would violate the partial unique index if delete had not cleared the flag.
    await service.updateContact(
      company.id,
      second.id,
      base(client.id, { firstName: 'Bea', isPrimary: true }),
    );

    expect(await primaryCount(client.id)).toBe(1);
  });
});

describe('client scoping', () => {
  it('refuses to attach a contact to another tenant’s client', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await expect(service.createContact(a.company.id, base(b.client.id))).rejects.toThrow(ValidationError);
  });
});

describe('cross-tenant access', () => {
  it('cannot read, update, or delete another company’s contact', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);
    const bContact = await service.createContact(b.company.id, base(b.client.id));

    await expect(service.getContact(a.company.id, bContact.id)).rejects.toThrow(NotFoundError);
    await expect(service.updateContact(a.company.id, bContact.id, base(a.client.id))).rejects.toThrow(
      NotFoundError,
    );
    await expect(service.deleteContact(a.company.id, bContact.id)).rejects.toThrow(NotFoundError);
  });
});

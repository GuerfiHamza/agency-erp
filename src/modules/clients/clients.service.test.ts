import { eq, like, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { clients, companies } from '@/db/schema';
import { NotFoundError } from '@/lib/errors';

import * as service from './clients.service';
import type { ClientInput } from './clients.validation';

/**
 * Against the real Postgres. These pin what a type checker cannot see: tenant
 * scoping (another company's client is invisible), the soft-delete filter, and
 * that search and status filters actually reach SQL.
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG_A = 'vitest-clients-a';
const SLUG_B = 'vitest-clients-b';
const NAME_PREFIX = 'vitest-client-';

async function cleanup() {
  // Clients cascade from companies; deleting the companies is enough, but be
  // explicit in case a fixture ever lands a client on a shared company.
  await db.delete(clients).where(like(clients.name, `${NAME_PREFIX}%`));
  await db.delete(companies).where(or(eq(companies.slug, SLUG_A), eq(companies.slug, SLUG_B)));
}

beforeEach(cleanup);
afterAll(cleanup);

async function createCompany(slug: string) {
  const [company] = await db.insert(companies).values({ name: 'Vitest Co', slug }).returning();
  if (!company) throw new Error('fixture company failed');
  return company;
}

const base: ClientInput = {
  name: `${NAME_PREFIX}acme`,
  type: 'company',
  status: 'prospect',
  legalName: null,
  taxId: null,
  registrationNumber: null,
  nif: null,
  nis: null,
  articleNumber: null,
  email: 'buyer@acme.test',
  phone: null,
  website: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  postalCode: null,
  country: null,
  currency: null,
  paymentTermsDays: null,
  ownerId: null,
  notes: null,
};

describe('createClient', () => {
  it('stores the client and reads it back scoped to the company', async () => {
    const company = await createCompany(SLUG_A);

    const created = await service.createClient(company.id, base);
    const found = await service.getClient(company.id, created.id);

    expect(found.name).toBe(base.name);
    expect(found.email).toBe('buyer@acme.test');
    expect(found.status).toBe('prospect');
  });
});

describe('listClients', () => {
  it('filters by status and by search term', async () => {
    const company = await createCompany(SLUG_A);
    await service.createClient(company.id, { ...base, name: `${NAME_PREFIX}alpha`, status: 'active' });
    await service.createClient(company.id, { ...base, name: `${NAME_PREFIX}beta`, status: 'archived' });

    const active = await service.listClients(company.id, {
      page: 1,
      pageSize: 25,
      statuses: ['active'],
    });
    expect(active.items.map((c) => c.name)).toEqual([`${NAME_PREFIX}alpha`]);

    const searched = await service.listClients(company.id, {
      page: 1,
      pageSize: 25,
      search: 'beta',
    });
    expect(searched.items.map((c) => c.name)).toEqual([`${NAME_PREFIX}beta`]);
  });
});

describe('deleteClient', () => {
  it('soft-deletes: gone from the list, and reads as not found', async () => {
    const company = await createCompany(SLUG_A);
    const created = await service.createClient(company.id, base);

    await service.deleteClient(company.id, created.id);

    await expect(service.getClient(company.id, created.id)).rejects.toThrow(NotFoundError);
    const list = await service.listClients(company.id, { page: 1, pageSize: 25 });
    expect(list.items.find((c) => c.id === created.id)).toBeUndefined();
  });
});

describe('cross-tenant access', () => {
  it('cannot read, update, or delete another company’s client', async () => {
    const a = await createCompany(SLUG_A);
    const b = await createCompany(SLUG_B);
    const bClient = await service.createClient(b.id, base);

    await expect(service.getClient(a.id, bClient.id)).rejects.toThrow(NotFoundError);
    await expect(
      service.updateClient(a.id, bClient.id, { ...base, name: `${NAME_PREFIX}hijack` }),
    ).rejects.toThrow(NotFoundError);
    await expect(service.deleteClient(a.id, bClient.id)).rejects.toThrow(NotFoundError);

    // b's client is untouched.
    const stillThere = await service.getClient(b.id, bClient.id);
    expect(stillThere.name).toBe(base.name);
  });
});

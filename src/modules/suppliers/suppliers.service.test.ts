import { eq, like, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { companies, suppliers } from '@/db/schema';
import { NotFoundError } from '@/lib/errors';

import * as service from './suppliers.service';
import type { SupplierInput } from './suppliers.validation';

/**
 * Against the real Postgres. These pin what a type checker cannot see: tenant
 * scoping (another company's supplier is invisible), the soft-delete filter,
 * and that search and status filters actually reach SQL.
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG_A = 'vitest-suppliers-a';
const SLUG_B = 'vitest-suppliers-b';
const NAME_PREFIX = 'vitest-supplier-';

async function cleanup() {
  // Suppliers cascade from companies; deleting the companies is enough, but
  // be explicit in case a fixture ever lands a supplier on a shared company.
  await db.delete(suppliers).where(like(suppliers.name, `${NAME_PREFIX}%`));
  await db.delete(companies).where(or(eq(companies.slug, SLUG_A), eq(companies.slug, SLUG_B)));
}

beforeEach(cleanup);
afterAll(cleanup);

async function createCompany(slug: string) {
  const [company] = await db.insert(companies).values({ name: 'Vitest Co', slug }).returning();
  if (!company) throw new Error('fixture company failed');
  return company;
}

const base: SupplierInput = {
  name: `${NAME_PREFIX}acme`,
  status: 'active',
  legalName: null,
  taxId: null,
  email: 'sales@acme-supply.test',
  phone: null,
  website: null,
  contactName: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  postalCode: null,
  country: null,
  currency: null,
  paymentTermsDays: null,
  notes: null,
};

describe('createSupplier', () => {
  it('stores the supplier and reads it back scoped to the company', async () => {
    const company = await createCompany(SLUG_A);

    const created = await service.createSupplier(company.id, base);
    const found = await service.getSupplier(company.id, created.id);

    expect(found.name).toBe(base.name);
    expect(found.email).toBe('sales@acme-supply.test');
    expect(found.status).toBe('active');
  });
});

describe('listSuppliers', () => {
  it('filters by status and by search term', async () => {
    const company = await createCompany(SLUG_A);
    await service.createSupplier(company.id, { ...base, name: `${NAME_PREFIX}alpha`, status: 'active' });
    await service.createSupplier(company.id, { ...base, name: `${NAME_PREFIX}beta`, status: 'archived' });

    const active = await service.listSuppliers(company.id, {
      page: 1,
      pageSize: 25,
      statuses: ['active'],
    });
    expect(active.items.map((s) => s.name)).toEqual([`${NAME_PREFIX}alpha`]);

    const searched = await service.listSuppliers(company.id, {
      page: 1,
      pageSize: 25,
      search: 'beta',
    });
    expect(searched.items.map((s) => s.name)).toEqual([`${NAME_PREFIX}beta`]);
  });
});

describe('deleteSupplier', () => {
  it('soft-deletes: gone from the list, and reads as not found', async () => {
    const company = await createCompany(SLUG_A);
    const created = await service.createSupplier(company.id, base);

    await service.deleteSupplier(company.id, created.id);

    await expect(service.getSupplier(company.id, created.id)).rejects.toThrow(NotFoundError);
    const list = await service.listSuppliers(company.id, { page: 1, pageSize: 25 });
    expect(list.items.find((s) => s.id === created.id)).toBeUndefined();
  });
});

describe('cross-tenant access', () => {
  it('cannot read, update, or delete another company’s supplier', async () => {
    const a = await createCompany(SLUG_A);
    const b = await createCompany(SLUG_B);
    const bSupplier = await service.createSupplier(b.id, base);

    await expect(service.getSupplier(a.id, bSupplier.id)).rejects.toThrow(NotFoundError);
    await expect(
      service.updateSupplier(a.id, bSupplier.id, { ...base, name: `${NAME_PREFIX}hijack` }),
    ).rejects.toThrow(NotFoundError);
    await expect(service.deleteSupplier(a.id, bSupplier.id)).rejects.toThrow(NotFoundError);

    // b's supplier is untouched.
    const stillThere = await service.getSupplier(b.id, bSupplier.id);
    expect(stillThere.name).toBe(base.name);
  });
});

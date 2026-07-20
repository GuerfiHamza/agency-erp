import { and, eq, like, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { clients, companies, leads } from '@/db/schema';
import { ConflictError, NotFoundError } from '@/lib/errors';

import * as service from './leads.service';
import type { LeadInput } from './leads.validation';

/**
 * Against the real Postgres. Pins what a type checker cannot see: tenant
 * scoping, the soft-delete filter, and the conversion transaction — a lead
 * becomes a client exactly once, and the lead is kept (not deleted) for funnel
 * reporting.
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG_A = 'vitest-leads-a';
const SLUG_B = 'vitest-leads-b';
const NAME_PREFIX = 'vitest-lead-';

async function cleanup() {
  await db.delete(leads).where(like(leads.name, `${NAME_PREFIX}%`));
  await db.delete(clients).where(like(clients.name, `${NAME_PREFIX}%`));
  // Everything above cascades from companies too, but be explicit.
  await db.delete(companies).where(or(eq(companies.slug, SLUG_A), eq(companies.slug, SLUG_B)));
}

beforeEach(cleanup);
afterAll(cleanup);

async function createCompany(slug: string) {
  const [company] = await db.insert(companies).values({ name: 'Vitest Co', slug }).returning();
  if (!company) throw new Error('fixture company failed');
  return company;
}

const base: LeadInput = {
  name: `${NAME_PREFIX}jane`,
  companyName: `${NAME_PREFIX}acme`,
  email: 'jane@acme.test',
  phone: null,
  status: 'new',
  source: 'website',
  estimatedValue: '1500.00',
  currency: 'EUR',
  ownerId: null,
  notes: null,
};

describe('createLead / listLeads', () => {
  it('stores the lead and filters by status and search', async () => {
    const company = await createCompany(SLUG_A);
    await service.createLead(company.id, { ...base, name: `${NAME_PREFIX}alpha`, status: 'qualified' });
    await service.createLead(company.id, { ...base, name: `${NAME_PREFIX}beta`, status: 'unqualified' });

    const qualified = await service.listLeads(company.id, {
      page: 1,
      pageSize: 25,
      statuses: ['qualified'],
    });
    expect(qualified.items.map((l) => l.name)).toEqual([`${NAME_PREFIX}alpha`]);

    const searched = await service.listLeads(company.id, { page: 1, pageSize: 25, search: 'beta' });
    expect(searched.items.map((l) => l.name)).toEqual([`${NAME_PREFIX}beta`]);
  });
});

describe('convertLead', () => {
  it('creates a client, keeps the lead, and marks it converted', async () => {
    const company = await createCompany(SLUG_A);
    const lead = await service.createLead(company.id, base);

    const { clientId } = await service.convertLead(company.id, lead.id);

    // Client created from the lead's company name.
    const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
    expect(client?.name).toBe(base.companyName);
    expect(client?.type).toBe('company');

    // Lead retained and stamped, not deleted.
    const after = await service.getLead(company.id, lead.id);
    expect(after.status).toBe('converted');
    expect(after.convertedClientId).toBe(clientId);
    expect(after.convertedAt).not.toBeNull();
  });

  it('refuses a second conversion', async () => {
    const company = await createCompany(SLUG_A);
    const lead = await service.createLead(company.id, base);

    await service.convertLead(company.id, lead.id);
    await expect(service.convertLead(company.id, lead.id)).rejects.toThrow(ConflictError);

    // And only one client was created.
    const created = await db
      .select()
      .from(clients)
      .where(and(eq(clients.companyId, company.id), eq(clients.name, base.companyName!)));
    expect(created).toHaveLength(1);
  });
});

describe('deleteLead', () => {
  it('soft-deletes: gone from the list, reads as not found', async () => {
    const company = await createCompany(SLUG_A);
    const lead = await service.createLead(company.id, base);

    await service.deleteLead(company.id, lead.id);

    await expect(service.getLead(company.id, lead.id)).rejects.toThrow(NotFoundError);
    const list = await service.listLeads(company.id, { page: 1, pageSize: 25 });
    expect(list.items.find((l) => l.id === lead.id)).toBeUndefined();
  });
});

describe('cross-tenant access', () => {
  it('cannot read, update, delete, or convert another company’s lead', async () => {
    const a = await createCompany(SLUG_A);
    const b = await createCompany(SLUG_B);
    const bLead = await service.createLead(b.id, base);

    await expect(service.getLead(a.id, bLead.id)).rejects.toThrow(NotFoundError);
    await expect(
      service.updateLead(a.id, bLead.id, { ...base, name: `${NAME_PREFIX}hijack` }),
    ).rejects.toThrow(NotFoundError);
    await expect(service.deleteLead(a.id, bLead.id)).rejects.toThrow(NotFoundError);
    await expect(service.convertLead(a.id, bLead.id)).rejects.toThrow(NotFoundError);

    // b's lead is untouched and unconverted.
    const stillThere = await service.getLead(b.id, bLead.id);
    expect(stillThere.convertedAt).toBeNull();
  });
});

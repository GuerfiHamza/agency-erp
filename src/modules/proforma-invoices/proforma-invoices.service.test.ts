import { eq, inArray, like, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { clients, companies, contacts, projects, proformaInvoices, quotes, user } from '@/db/schema';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import * as quotesService from '@/modules/quotes/quotes.service';
import type { QuoteInput } from '@/modules/quotes/quotes.validation';

import * as service from './proforma-invoices.service';
import type { ProformaInput } from './proforma-invoices.validation';

/**
 * Against the real Postgres. Pins number generation, tenant guards, the
 * `send` transition, and — the one thing unique to this module — creating a
 * proforma pre-filled from a quote's client/contact/project/items.
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG_A = 'vitest-proforma-a';
const SLUG_B = 'vitest-proforma-b';
const CLIENT_NAME = 'vitest-proforma-client';
const FIXTURE = 'vitest-proforma-';

/**
 * Both `quotes.clientId` and `proforma_invoices.clientId` are `restrict`, so
 * deleting fixture clients before their documents is a live FK violation, not
 * a no-op — same trap `quotes.service.test.ts` hit first.
 */
async function cleanup() {
  const fixtureClients = await db
    .select({ id: clients.id })
    .from(clients)
    .where(like(clients.name, `${CLIENT_NAME}%`));
  const clientIds = fixtureClients.map((row) => row.id);

  if (clientIds.length > 0) {
    await db.delete(proformaInvoices).where(inArray(proformaInvoices.clientId, clientIds));
    await db.delete(quotes).where(inArray(quotes.clientId, clientIds));
  }

  await db.delete(user).where(like(user.email, `${FIXTURE}%`));
  await db.delete(clients).where(like(clients.name, `${CLIENT_NAME}%`));
  await db.delete(companies).where(or(eq(companies.slug, SLUG_A), eq(companies.slug, SLUG_B)));
}

beforeEach(cleanup);
afterAll(cleanup);

async function fixture(slug: string) {
  const [company] = await db.insert(companies).values({ name: 'Vitest Co', slug }).returning();
  if (!company) throw new Error('fixture company failed');

  const [actor] = await db
    .insert(user)
    .values({
      name: 'Actor',
      email: `${FIXTURE}${slug}@nexus.test`,
      emailVerified: true,
      companyId: company.id,
    })
    .returning();
  const [client] = await db.insert(clients).values({ companyId: company.id, name: CLIENT_NAME }).returning();
  if (!client) throw new Error('fixture client failed');

  const [contact] = await db
    .insert(contacts)
    .values({ companyId: company.id, clientId: client.id, firstName: 'Jo' })
    .returning();
  const [project] = await db
    .insert(projects)
    .values({ companyId: company.id, clientId: client.id, name: 'Website', code: `PRJ-${slug}-1` })
    .returning();

  return { company, actor: actor!, client: client!, contact: contact!, project: project! };
}

function base(clientId: string): ProformaInput {
  return {
    clientId,
    contactId: null,
    projectId: null,
    title: 'Website redesign proforma',
    status: 'draft',
    issueDate: new Date('2026-07-01T00:00:00Z'),
    validUntil: null,
    currency: 'EUR',
    notes: null,
    terms: null,
    items: [
      { description: 'Design', quantity: '2', unitPrice: '10.00', discountPercent: '10', taxRate: '20' },
    ],
  };
}

function quoteBase(clientId: string): QuoteInput {
  return {
    clientId,
    contactId: null,
    opportunityId: null,
    projectId: null,
    title: 'Website redesign quote',
    status: 'accepted',
    issueDate: new Date('2026-07-01T00:00:00Z'),
    validUntil: null,
    currency: 'EUR',
    notes: 'Quote notes',
    terms: 'Net 30',
    items: [
      { description: 'Design', quantity: '2', unitPrice: '10.00', discountPercent: '10', taxRate: '20' },
    ],
  };
}

describe('createProforma', () => {
  it('generates a PRO-{year}-{seq} number and computes totals from the line items', async () => {
    const f = await fixture(SLUG_A);

    const proforma = await service.createProforma(f.company.id, f.actor.id, base(f.client.id));

    expect(proforma.number).toMatch(/^PRO-\d{4}-0001$/);
    expect(proforma.subtotal).toBe('20.00');
    expect(proforma.discountTotal).toBe('2.00');
    expect(proforma.taxTotal).toBe('3.60');
    expect(proforma.total).toBe('21.60');
    expect(proforma.quoteId).toBeNull();
  });
});

describe('link tenant guards', () => {
  it('refuses a client from another tenant', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await expect(service.createProforma(a.company.id, a.actor.id, base(b.client.id))).rejects.toThrow(
      ValidationError,
    );
  });

  it('refuses a contact that is not on the selected client', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await expect(
      service.createProforma(a.company.id, a.actor.id, { ...base(a.client.id), contactId: b.contact.id }),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses a project from another tenant', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await expect(
      service.createProforma(a.company.id, a.actor.id, { ...base(a.client.id), projectId: b.project.id }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('createProformaFromQuote', () => {
  it('copies the client, contact, project, currency, notes, terms, and items', async () => {
    const f = await fixture(SLUG_A);
    const quote = await quotesService.createQuote(f.company.id, f.actor.id, {
      ...quoteBase(f.client.id),
      contactId: f.contact.id,
      projectId: f.project.id,
    });

    const proforma = await service.createProformaFromQuote(f.company.id, f.actor.id, quote.id);

    expect(proforma.quoteId).toBe(quote.id);
    expect(proforma.clientId).toBe(f.client.id);
    expect(proforma.contactId).toBe(f.contact.id);
    expect(proforma.projectId).toBe(f.project.id);
    expect(proforma.currency).toBe('EUR');
    expect(proforma.notes).toBe('Quote notes');
    expect(proforma.terms).toBe('Net 30');
    expect(proforma.total).toBe('21.60');
    expect(proforma.status).toBe('draft');

    const reread = await service.getProforma(f.company.id, proforma.id);
    expect(reread.items).toHaveLength(1);
    expect(reread.items[0]?.description).toBe('Design');
  });

  it('is not single-use — the same quote can seed more than one proforma', async () => {
    const f = await fixture(SLUG_A);
    const quote = await quotesService.createQuote(f.company.id, f.actor.id, quoteBase(f.client.id));

    const first = await service.createProformaFromQuote(f.company.id, f.actor.id, quote.id);
    const second = await service.createProformaFromQuote(f.company.id, f.actor.id, quote.id);

    expect(first.id).not.toBe(second.id);
    expect(first.quoteId).toBe(quote.id);
    expect(second.quoteId).toBe(quote.id);
  });

  it('refuses a quote from another tenant', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);
    const bQuote = await quotesService.createQuote(b.company.id, b.actor.id, quoteBase(b.client.id));

    await expect(service.createProformaFromQuote(a.company.id, a.actor.id, bQuote.id)).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe('updateProforma', () => {
  it('replaces the line items and recomputes totals', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createProforma(f.company.id, f.actor.id, base(f.client.id));

    const updated = await service.updateProforma(f.company.id, created.id, {
      ...base(f.client.id),
      items: [
        { description: 'Design', quantity: '1', unitPrice: '100.00', discountPercent: '0', taxRate: '0' },
      ],
    });

    expect(updated.total).toBe('100.00');
  });
});

describe('sendProforma', () => {
  it('moves a draft to sent and stamps sentAt', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createProforma(f.company.id, f.actor.id, base(f.client.id));

    const sent = await service.sendProforma(f.company.id, created.id);

    expect(sent.status).toBe('sent');
    expect(sent.sentAt).not.toBeNull();
  });

  it('refuses to send a proforma that is not a draft', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createProforma(f.company.id, f.actor.id, base(f.client.id));
    await service.sendProforma(f.company.id, created.id);

    await expect(service.sendProforma(f.company.id, created.id)).rejects.toThrow(ConflictError);
  });
});

describe('cross-tenant access', () => {
  it('cannot read, update, or delete another company’s proforma invoice', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);
    const bProforma = await service.createProforma(b.company.id, b.actor.id, base(b.client.id));

    await expect(service.getProforma(a.company.id, bProforma.id)).rejects.toThrow(NotFoundError);
    await expect(service.updateProforma(a.company.id, bProforma.id, base(a.client.id))).rejects.toThrow(
      NotFoundError,
    );
    await expect(service.deleteProforma(a.company.id, bProforma.id)).rejects.toThrow(NotFoundError);
  });
});

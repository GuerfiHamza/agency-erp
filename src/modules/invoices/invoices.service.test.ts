import { eq, inArray, like, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import {
  clients,
  companies,
  contacts,
  invoices,
  projects,
  proformaInvoices,
  quotes,
  user,
} from '@/db/schema';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import * as proformasService from '@/modules/proforma-invoices/proforma-invoices.service';
import type { ProformaInput } from '@/modules/proforma-invoices/proforma-invoices.validation';
import * as quotesService from '@/modules/quotes/quotes.service';
import type { QuoteInput } from '@/modules/quotes/quotes.validation';

import * as service from './invoices.service';
import type { InvoiceInput } from './invoices.validation';

/**
 * Against the real Postgres. Pins number generation, tenant guards, the
 * draft-only edit lock, the delete-restricted-to-draft/cancelled rule, the
 * send/void/cancel transitions, and the two from-source converters — the
 * proforma one is the interesting case: it must mark the source proforma
 * `converted` after the invoice exists.
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG_A = 'vitest-invoices-a';
const SLUG_B = 'vitest-invoices-b';
const CLIENT_NAME = 'vitest-invoices-client';
const FIXTURE = 'vitest-invoices-';

/**
 * `invoices.clientId`, `quotes.clientId`, and `proforma_invoices.clientId` are
 * all `restrict` — every document referencing a fixture client must be
 * cleared before the client, or the FK throws instead of no-op-ing.
 */
async function cleanup() {
  const fixtureClients = await db
    .select({ id: clients.id })
    .from(clients)
    .where(like(clients.name, `${CLIENT_NAME}%`));
  const clientIds = fixtureClients.map((row) => row.id);

  if (clientIds.length > 0) {
    await db.delete(invoices).where(inArray(invoices.clientId, clientIds));
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

const DUE_DATE = new Date('2026-08-01T00:00:00Z');

function base(clientId: string): InvoiceInput {
  return {
    clientId,
    contactId: null,
    projectId: null,
    title: 'Website redesign invoice',
    issueDate: new Date('2026-07-01T00:00:00Z'),
    dueDate: DUE_DATE,
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
    notes: null,
    terms: null,
    items: [
      { description: 'Design', quantity: '2', unitPrice: '10.00', discountPercent: '10', taxRate: '20' },
    ],
  };
}

function proformaBase(clientId: string): ProformaInput {
  return {
    clientId,
    contactId: null,
    projectId: null,
    title: 'Website redesign proforma',
    status: 'sent',
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

describe('createInvoice', () => {
  it('generates an INV-{year}-{seq} number, computes totals, and starts with amountPaid at 0', async () => {
    const f = await fixture(SLUG_A);

    const invoice = await service.createInvoice(f.company.id, f.actor.id, base(f.client.id));

    expect(invoice.number).toMatch(/^INV-\d{4}-0001$/);
    expect(invoice.total).toBe('21.60');
    expect(invoice.amountPaid).toBe('0.00');
    expect(invoice.status).toBe('draft');
    expect(invoice.quoteId).toBeNull();
    expect(invoice.proformaInvoiceId).toBeNull();
  });
});

describe('link tenant guards', () => {
  it('refuses a client from another tenant', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await expect(service.createInvoice(a.company.id, a.actor.id, base(b.client.id))).rejects.toThrow(
      ValidationError,
    );
  });

  it('refuses a contact that is not on the selected client', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await expect(
      service.createInvoice(a.company.id, a.actor.id, { ...base(a.client.id), contactId: b.contact.id }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('createInvoiceFromQuote', () => {
  it('copies the client, currency, and items with no mark left on the quote', async () => {
    const f = await fixture(SLUG_A);
    const quote = await quotesService.createQuote(f.company.id, f.actor.id, quoteBase(f.client.id));

    const invoice = await service.createInvoiceFromQuote(f.company.id, f.actor.id, quote.id, DUE_DATE);

    expect(invoice.quoteId).toBe(quote.id);
    expect(invoice.clientId).toBe(f.client.id);
    expect(invoice.total).toBe('21.60');
    expect(invoice.dueDate.toISOString()).toBe(DUE_DATE.toISOString());
  });
});

describe('createInvoiceFromProforma', () => {
  it('copies the proforma and marks it converted once the invoice exists', async () => {
    const f = await fixture(SLUG_A);
    const proforma = await proformasService.createProforma(
      f.company.id,
      f.actor.id,
      proformaBase(f.client.id),
    );

    const invoice = await service.createInvoiceFromProforma(f.company.id, f.actor.id, proforma.id, DUE_DATE);

    expect(invoice.proformaInvoiceId).toBe(proforma.id);
    expect(invoice.total).toBe('21.60');

    const reread = await proformasService.getProforma(f.company.id, proforma.id);
    expect(reread.status).toBe('converted');
    expect(reread.convertedAt).not.toBeNull();
  });

  it('refuses a proforma from another tenant', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);
    const bProforma = await proformasService.createProforma(
      b.company.id,
      b.actor.id,
      proformaBase(b.client.id),
    );

    await expect(
      service.createInvoiceFromProforma(a.company.id, a.actor.id, bProforma.id, DUE_DATE),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('updateInvoice', () => {
  it('edits a draft and recomputes totals', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createInvoice(f.company.id, f.actor.id, base(f.client.id));

    const updated = await service.updateInvoice(f.company.id, created.id, {
      ...base(f.client.id),
      items: [
        { description: 'Design', quantity: '1', unitPrice: '100.00', discountPercent: '0', taxRate: '0' },
      ],
    });

    expect(updated.total).toBe('100.00');
  });

  it('refuses to edit once sent', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createInvoice(f.company.id, f.actor.id, base(f.client.id));
    await service.sendInvoice(f.company.id, created.id);

    await expect(service.updateInvoice(f.company.id, created.id, base(f.client.id))).rejects.toThrow(
      ConflictError,
    );
  });
});

describe('sendInvoice', () => {
  it('moves a draft to sent and stamps sentAt', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createInvoice(f.company.id, f.actor.id, base(f.client.id));

    const sent = await service.sendInvoice(f.company.id, created.id);

    expect(sent.status).toBe('sent');
    expect(sent.sentAt).not.toBeNull();
  });

  it('refuses to send a non-draft invoice', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createInvoice(f.company.id, f.actor.id, base(f.client.id));
    await service.sendInvoice(f.company.id, created.id);

    await expect(service.sendInvoice(f.company.id, created.id)).rejects.toThrow(ConflictError);
  });
});

describe('voidInvoice', () => {
  it('voids a sent invoice and stamps voidedAt', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createInvoice(f.company.id, f.actor.id, base(f.client.id));
    await service.sendInvoice(f.company.id, created.id);

    const voided = await service.voidInvoice(f.company.id, created.id);

    expect(voided.status).toBe('void');
    expect(voided.voidedAt).not.toBeNull();
  });

  it('refuses to void a draft — cancel it instead', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createInvoice(f.company.id, f.actor.id, base(f.client.id));

    await expect(service.voidInvoice(f.company.id, created.id)).rejects.toThrow(ConflictError);
  });
});

describe('cancelInvoice', () => {
  it('cancels a draft', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createInvoice(f.company.id, f.actor.id, base(f.client.id));

    const cancelled = await service.cancelInvoice(f.company.id, created.id);

    expect(cancelled.status).toBe('cancelled');
  });

  it('refuses to cancel a sent invoice', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createInvoice(f.company.id, f.actor.id, base(f.client.id));
    await service.sendInvoice(f.company.id, created.id);

    await expect(service.cancelInvoice(f.company.id, created.id)).rejects.toThrow(ConflictError);
  });
});

describe('deleteInvoice', () => {
  it('deletes a draft', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createInvoice(f.company.id, f.actor.id, base(f.client.id));

    await service.deleteInvoice(f.company.id, created.id);

    await expect(service.getInvoice(f.company.id, created.id)).rejects.toThrow(NotFoundError);
  });

  it('deletes a cancelled invoice', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createInvoice(f.company.id, f.actor.id, base(f.client.id));
    await service.cancelInvoice(f.company.id, created.id);

    await service.deleteInvoice(f.company.id, created.id);

    await expect(service.getInvoice(f.company.id, created.id)).rejects.toThrow(NotFoundError);
  });

  it('refuses to delete a sent invoice — a number that was issued can never be recycled', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createInvoice(f.company.id, f.actor.id, base(f.client.id));
    await service.sendInvoice(f.company.id, created.id);

    await expect(service.deleteInvoice(f.company.id, created.id)).rejects.toThrow(ConflictError);
  });
});

describe('cross-tenant access', () => {
  it('cannot read, update, or delete another company’s invoice', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);
    const bInvoice = await service.createInvoice(b.company.id, b.actor.id, base(b.client.id));

    await expect(service.getInvoice(a.company.id, bInvoice.id)).rejects.toThrow(NotFoundError);
    await expect(service.updateInvoice(a.company.id, bInvoice.id, base(a.client.id))).rejects.toThrow(
      NotFoundError,
    );
    await expect(service.deleteInvoice(a.company.id, bInvoice.id)).rejects.toThrow(NotFoundError);
  });
});

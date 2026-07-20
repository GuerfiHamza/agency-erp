import { eq, inArray, like, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { clients, companies, contacts, opportunities, projects, quotes, user } from '@/db/schema';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';

import * as service from './quotes.service';
import type { QuoteInput } from './quotes.validation';

/**
 * Against the real Postgres. Pins number generation, the decimal-math totals
 * (exercised again here, not just in `money.test.ts`, so a service-level
 * regression in how `computeDocumentTotals` is wired shows up too), the
 * tenant guards on every linked record, the `send` transition, and that line
 * items are fully replaced on edit.
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG_A = 'vitest-quotes-a';
const SLUG_B = 'vitest-quotes-b';
const CLIENT_NAME = 'vitest-quotes-client';
const FIXTURE = 'vitest-quotes-';

/**
 * A quote's `clientId` FK is `restrict` (a real financial document, per the
 * schema), so deleting the fixture clients before their quotes is a
 * violation, not a no-op. Clear quotes first.
 */
async function cleanup() {
  const fixtureClients = await db
    .select({ id: clients.id })
    .from(clients)
    .where(like(clients.name, `${CLIENT_NAME}%`));
  const clientIds = fixtureClients.map((row) => row.id);

  if (clientIds.length > 0) {
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
  const [opportunity] = await db
    .insert(opportunities)
    .values({ companyId: company.id, clientId: client.id, name: 'Website redesign' })
    .returning();
  const [project] = await db
    .insert(projects)
    .values({ companyId: company.id, clientId: client.id, name: 'Website', code: `PRJ-${slug}-1` })
    .returning();

  return {
    company,
    actor: actor!,
    client: client!,
    contact: contact!,
    opportunity: opportunity!,
    project: project!,
  };
}

function base(clientId: string): QuoteInput {
  return {
    clientId,
    contactId: null,
    opportunityId: null,
    projectId: null,
    title: 'Website redesign quote',
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

describe('createQuote', () => {
  it('generates a QUO-{year}-{seq} number and computes totals from the line items', async () => {
    const f = await fixture(SLUG_A);

    const quote = await service.createQuote(f.company.id, f.actor.id, base(f.client.id));

    expect(quote.number).toMatch(/^QUO-\d{4}-0001$/);
    expect(quote.subtotal).toBe('20.00');
    expect(quote.discountTotal).toBe('2.00');
    expect(quote.taxTotal).toBe('3.60');
    expect(quote.total).toBe('21.60');
  });

  it('allocates sequential numbers within the same company', async () => {
    const f = await fixture(SLUG_A);

    const first = await service.createQuote(f.company.id, f.actor.id, base(f.client.id));
    const second = await service.createQuote(f.company.id, f.actor.id, base(f.client.id));

    expect(first.number).not.toBe(second.number);
  });
});

describe('link tenant guards', () => {
  it('refuses a client from another tenant', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await expect(service.createQuote(a.company.id, a.actor.id, base(b.client.id))).rejects.toThrow(
      ValidationError,
    );
  });

  it('refuses a contact that is not on the selected client', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await expect(
      service.createQuote(a.company.id, a.actor.id, { ...base(a.client.id), contactId: b.contact.id }),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses an opportunity or project from another tenant', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await expect(
      service.createQuote(a.company.id, a.actor.id, {
        ...base(a.client.id),
        opportunityId: b.opportunity.id,
      }),
    ).rejects.toThrow(ValidationError);

    await expect(
      service.createQuote(a.company.id, a.actor.id, { ...base(a.client.id), projectId: b.project.id }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('updateQuote', () => {
  it('replaces the line items and recomputes totals', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createQuote(f.company.id, f.actor.id, base(f.client.id));

    const updated = await service.updateQuote(f.company.id, created.id, {
      ...base(f.client.id),
      items: [
        { description: 'Design', quantity: '1', unitPrice: '100.00', discountPercent: '0', taxRate: '0' },
      ],
    });

    expect(updated.total).toBe('100.00');

    const reread = await service.getQuote(f.company.id, created.id);
    expect(reread.items).toHaveLength(1);
    expect(reread.items[0]?.unitPrice).toBe('100.00');
  });
});

describe('sendQuote', () => {
  it('moves a draft to sent and stamps sentAt', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createQuote(f.company.id, f.actor.id, base(f.client.id));

    const sent = await service.sendQuote(f.company.id, created.id);

    expect(sent.status).toBe('sent');
    expect(sent.sentAt).not.toBeNull();
  });

  it('refuses to send a quote that is not a draft', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createQuote(f.company.id, f.actor.id, base(f.client.id));
    await service.sendQuote(f.company.id, created.id);

    await expect(service.sendQuote(f.company.id, created.id)).rejects.toThrow(ConflictError);
  });
});

describe('cross-tenant access', () => {
  it('cannot read, update, or delete another company’s quote', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);
    const bQuote = await service.createQuote(b.company.id, b.actor.id, base(b.client.id));

    await expect(service.getQuote(a.company.id, bQuote.id)).rejects.toThrow(NotFoundError);
    await expect(service.updateQuote(a.company.id, bQuote.id, base(a.client.id))).rejects.toThrow(
      NotFoundError,
    );
    await expect(service.deleteQuote(a.company.id, bQuote.id)).rejects.toThrow(NotFoundError);
  });
});

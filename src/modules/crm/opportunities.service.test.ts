import { eq, like, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { clients, companies, contacts } from '@/db/schema';
import { NotFoundError, ValidationError } from '@/lib/errors';

import * as service from './opportunities.service';
import type { OpportunityInput } from './opportunities.validation';

/**
 * Against the real Postgres. Pins what a type checker cannot see: the `closedAt`
 * rule (a deal is closed exactly when won or lost, and the close date survives
 * later edits), tenant scoping, and that an opportunity cannot attach to another
 * tenant's client.
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG_A = 'vitest-opps-a';
const SLUG_B = 'vitest-opps-b';
const CLIENT_NAME = 'vitest-opps-client';

async function cleanup() {
  await db.delete(clients).where(like(clients.name, `${CLIENT_NAME}%`));
  await db.delete(companies).where(or(eq(companies.slug, SLUG_A), eq(companies.slug, SLUG_B)));
}

beforeEach(cleanup);
afterAll(cleanup);

async function createCompanyWithClient(slug: string) {
  const [company] = await db.insert(companies).values({ name: 'Vitest Co', slug }).returning();
  if (!company) throw new Error('fixture company failed');

  const [client] = await db.insert(clients).values({ companyId: company.id, name: CLIENT_NAME }).returning();
  if (!client) throw new Error('fixture client failed');

  return { company, client };
}

function base(clientId: string): OpportunityInput {
  return {
    name: 'Website redesign',
    clientId,
    contactId: null,
    stage: 'discovery',
    value: '10000.00',
    currency: 'EUR',
    probability: '40',
    expectedCloseDate: null,
    lostReason: null,
    ownerId: null,
  };
}

describe('closedAt derivation', () => {
  it('is null for an open stage and set when won', async () => {
    const { company, client } = await createCompanyWithClient(SLUG_A);

    const open = await service.createOpportunity(company.id, base(client.id));
    expect(open.closedAt).toBeNull();

    const won = await service.createOpportunity(company.id, { ...base(client.id), stage: 'won' });
    expect(won.closedAt).not.toBeNull();
  });

  it('sets closedAt when moving to won, and preserves it across a later edit', async () => {
    const { company, client } = await createCompanyWithClient(SLUG_A);
    const opp = await service.createOpportunity(company.id, base(client.id));

    const won = await service.updateOpportunity(company.id, opp.id, { ...base(client.id), stage: 'won' });
    expect(won.closedAt).not.toBeNull();
    const closedAt = won.closedAt;

    // Editing an unrelated field must not reset when it closed.
    const renamed = await service.updateOpportunity(company.id, opp.id, {
      ...base(client.id),
      stage: 'won',
      name: 'Website redesign v2',
    });
    expect(renamed.closedAt?.getTime()).toBe(closedAt?.getTime());
  });

  it('clears closedAt when reopened', async () => {
    const { company, client } = await createCompanyWithClient(SLUG_A);
    const opp = await service.createOpportunity(company.id, { ...base(client.id), stage: 'lost' });
    expect(opp.closedAt).not.toBeNull();

    const reopened = await service.updateOpportunity(company.id, opp.id, {
      ...base(client.id),
      stage: 'negotiation',
    });
    expect(reopened.closedAt).toBeNull();
  });
});

describe('client scoping', () => {
  it('refuses to attach to another tenant’s client', async () => {
    const a = await createCompanyWithClient(SLUG_A);
    const b = await createCompanyWithClient(SLUG_B);

    await expect(service.createOpportunity(a.company.id, base(b.client.id))).rejects.toThrow(ValidationError);
  });
});

describe('contact scoping', () => {
  it('accepts a contact on the same client and rejects one on a different client', async () => {
    const a = await createCompanyWithClient(SLUG_A);

    const [sameClientContact] = await db
      .insert(contacts)
      .values({ companyId: a.company.id, clientId: a.client.id, firstName: 'Jo' })
      .returning();

    const opp = await service.createOpportunity(a.company.id, {
      ...base(a.client.id),
      contactId: sameClientContact!.id,
    });
    expect(opp.contactId).toBe(sameClientContact!.id);

    // A contact on a different client of the same company is still rejected.
    const [otherClient] = await db
      .insert(clients)
      .values({ companyId: a.company.id, name: `${CLIENT_NAME}-other` })
      .returning();
    const [otherContact] = await db
      .insert(contacts)
      .values({ companyId: a.company.id, clientId: otherClient!.id, firstName: 'Sam' })
      .returning();

    await expect(
      service.createOpportunity(a.company.id, { ...base(a.client.id), contactId: otherContact!.id }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('cross-tenant access', () => {
  it('cannot read, update, or delete another company’s opportunity', async () => {
    const a = await createCompanyWithClient(SLUG_A);
    const b = await createCompanyWithClient(SLUG_B);
    const bOpp = await service.createOpportunity(b.company.id, base(b.client.id));

    await expect(service.getOpportunity(a.company.id, bOpp.id)).rejects.toThrow(NotFoundError);
    await expect(service.updateOpportunity(a.company.id, bOpp.id, base(a.client.id))).rejects.toThrow(
      NotFoundError,
    );
    await expect(service.deleteOpportunity(a.company.id, bOpp.id)).rejects.toThrow(NotFoundError);
  });
});

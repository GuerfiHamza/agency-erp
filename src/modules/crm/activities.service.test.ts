import { eq, like, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { clients, companies, leads, opportunities, user } from '@/db/schema';
import { NotFoundError, ValidationError } from '@/lib/errors';

import * as service from './activities.service';
import type { ActivityInput } from './activities.validation';

/**
 * Against the real Postgres. Pins the link resolution (form kind/id → the right
 * foreign key), the tenant guard on the linked record, author attribution, and
 * cross-tenant scoping.
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG_A = 'vitest-act-a';
const SLUG_B = 'vitest-act-b';
const FIXTURE = 'vitest-act-';

async function cleanup() {
  await db.delete(user).where(like(user.email, `${FIXTURE}%`));
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
  const [client] = await db.insert(clients).values({ companyId: company.id, name: 'Acme' }).returning();
  const [lead] = await db.insert(leads).values({ companyId: company.id, name: 'Lead X' }).returning();
  const [opportunity] = await db
    .insert(opportunities)
    .values({ companyId: company.id, clientId: client!.id, name: 'Deal Y' })
    .returning();

  return { company, actor: actor!, client: client!, lead: lead!, opportunity: opportunity! };
}

const base: ActivityInput = {
  type: 'call',
  subject: 'Kickoff',
  body: null,
  occurredAt: new Date(),
  relatedKind: 'none',
  relatedId: null,
};

describe('link resolution', () => {
  it('sets exactly the chosen foreign key', async () => {
    const f = await fixture(SLUG_A);

    const toClient = await service.createActivity(f.company.id, f.actor.id, {
      ...base,
      relatedKind: 'client',
      relatedId: f.client.id,
    });
    expect(toClient.clientId).toBe(f.client.id);
    expect(toClient.leadId).toBeNull();
    expect(toClient.opportunityId).toBeNull();
    expect(toClient.createdById).toBe(f.actor.id);

    const toOpp = await service.createActivity(f.company.id, f.actor.id, {
      ...base,
      relatedKind: 'opportunity',
      relatedId: f.opportunity.id,
    });
    expect(toOpp.opportunityId).toBe(f.opportunity.id);
    expect(toOpp.clientId).toBeNull();
  });

  it('refuses to link to another tenant’s record', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await expect(
      service.createActivity(a.company.id, a.actor.id, {
        ...base,
        relatedKind: 'client',
        relatedId: b.client.id,
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('updateActivity', () => {
  it('preserves the original author', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createActivity(f.company.id, f.actor.id, base);

    const updated = await service.updateActivity(f.company.id, created.id, {
      ...base,
      subject: 'Kickoff (revised)',
    });
    expect(updated.createdById).toBe(f.actor.id);
    expect(updated.subject).toBe('Kickoff (revised)');
  });
});

describe('listActivities', () => {
  it('filters by type', async () => {
    const f = await fixture(SLUG_A);
    await service.createActivity(f.company.id, f.actor.id, { ...base, type: 'call', subject: 'A call' });
    await service.createActivity(f.company.id, f.actor.id, { ...base, type: 'email', subject: 'An email' });

    const calls = await service.listActivities(f.company.id, { page: 1, pageSize: 25, types: ['call'] });
    expect(calls.items.map((a) => a.subject)).toEqual(['A call']);
  });
});

describe('cross-tenant access', () => {
  it('cannot read, update, or delete another company’s activity', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);
    const bActivity = await service.createActivity(b.company.id, b.actor.id, base);

    await expect(service.getActivity(a.company.id, bActivity.id)).rejects.toThrow(NotFoundError);
    await expect(service.updateActivity(a.company.id, bActivity.id, base)).rejects.toThrow(NotFoundError);
    await expect(service.deleteActivity(a.company.id, bActivity.id)).rejects.toThrow(NotFoundError);
  });
});

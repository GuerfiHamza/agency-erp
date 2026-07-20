import { eq, like, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { clients, companies, projects, user } from '@/db/schema';
import { NotFoundError, ValidationError } from '@/lib/errors';

import * as service from './calendar.service';
import { eventFormSchema, monthRange, shiftMonth, type EventInput } from './calendar.validation';

/**
 * The pure month arithmetic runs without a database; the rest goes against real
 * Postgres and pins the range window, the link tenant guard, and scoping.
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG_A = 'vitest-calendar-a';
const SLUG_B = 'vitest-calendar-b';
const FIXTURE = 'vitest-calendar-';

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
  const [project] = await db
    .insert(projects)
    .values({ companyId: company.id, name: 'Website', code: `PRJ-${slug}-1` })
    .returning();

  return { company, actor: actor!, client: client!, project: project! };
}

function base(overrides: Partial<EventInput> = {}): EventInput {
  return {
    title: 'Kickoff',
    description: null,
    location: null,
    type: 'meeting',
    startsAt: new Date('2026-07-15T09:00:00Z'),
    endsAt: new Date('2026-07-15T10:00:00Z'),
    isAllDay: false,
    linkKind: 'none',
    linkId: null,
    ...overrides,
  };
}

describe('monthRange', () => {
  it('brackets the month with a day of padding at each end', () => {
    const { month, from, to } = monthRange('2026-07');

    expect(month).toBe('2026-07');
    expect(from.toISOString()).toBe('2026-06-30T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-08-02T00:00:00.000Z');
  });

  it('normalises nonsense rather than producing an invalid date', () => {
    expect(monthRange('2026-99').month).toBe('2034-03');
    expect(Number.isNaN(monthRange('nope').from.getTime())).toBe(false);
  });
});

describe('shiftMonth', () => {
  it('rolls over the year boundary in both directions', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('eventFormSchema', () => {
  it('rejects an end before the start and a link with no target', () => {
    const backwards = eventFormSchema.safeParse({
      ...base(),
      startsAt: '2026-07-15T10:00',
      endsAt: '2026-07-15T09:00',
    });
    expect(backwards.success).toBe(false);

    const danglingLink = eventFormSchema.safeParse({
      ...base(),
      startsAt: '2026-07-15T09:00',
      endsAt: '2026-07-15T10:00',
      linkKind: 'client',
      linkId: '',
    });
    expect(danglingLink.success).toBe(false);
  });
});

describe('listEventsInRange', () => {
  it('returns events that start inside the window and no others', async () => {
    const f = await fixture(SLUG_A);

    const inside = await service.createEvent(f.company.id, f.actor.id, base());
    await service.createEvent(
      f.company.id,
      f.actor.id,
      base({ startsAt: new Date('2026-09-01T09:00:00Z'), endsAt: new Date('2026-09-01T10:00:00Z') }),
    );

    const { from, to } = monthRange('2026-07');
    const found = await service.listEventsInRange(f.company.id, from, to);

    expect(found.map((event) => event.id)).toEqual([inside.id]);
  });

  it('does not leak another company’s events', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);
    await service.createEvent(b.company.id, b.actor.id, base());

    const { from, to } = monthRange('2026-07');

    expect(await service.listEventsInRange(a.company.id, from, to)).toEqual([]);
  });
});

describe('link resolution', () => {
  it('resolves each kind to exactly one foreign key', async () => {
    const f = await fixture(SLUG_A);

    const toClient = await service.createEvent(
      f.company.id,
      f.actor.id,
      base({ linkKind: 'client', linkId: f.client.id }),
    );
    expect(toClient.clientId).toBe(f.client.id);
    expect(toClient.projectId).toBeNull();
    expect(toClient.createdById).toBe(f.actor.id);

    // Re-pointing the link clears the previous column rather than adding a second.
    const repointed = await service.updateEvent(f.company.id, toClient.id, {
      ...base(),
      linkKind: 'project',
      linkId: f.project.id,
    });
    expect(repointed.projectId).toBe(f.project.id);
    expect(repointed.clientId).toBeNull();
  });

  it('refuses a target from another tenant', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await expect(
      service.createEvent(a.company.id, a.actor.id, base({ linkKind: 'client', linkId: b.client.id })),
    ).rejects.toThrow(ValidationError);
  });
});

describe('cross-tenant access', () => {
  it('cannot read, update, or delete another company’s event', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);
    const bEvent = await service.createEvent(b.company.id, b.actor.id, base());

    await expect(service.getEvent(a.company.id, bEvent.id)).rejects.toThrow(NotFoundError);
    await expect(service.updateEvent(a.company.id, bEvent.id, base())).rejects.toThrow(NotFoundError);
    await expect(service.deleteEvent(a.company.id, bEvent.id)).rejects.toThrow(NotFoundError);
  });
});

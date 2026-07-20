import { eq, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { companies, user } from '@/db/schema';
import { NotFoundError } from '@/lib/errors';

import * as service from './notifications.service';

/**
 * Against the real Postgres. Pins the `(companyId, userId)` scoping every
 * query applies — the one thing that makes this module different from every
 * other Phase 5 list: a notification belongs to a person, not the tenant —
 * plus the read/unread transitions and mark-all-read.
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG_A = 'vitest-notifications-a';
const SLUG_B = 'vitest-notifications-b';

async function cleanupAll() {
  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(or(eq(companies.slug, SLUG_A), eq(companies.slug, SLUG_B)));

  for (const row of rows) {
    await db.delete(user).where(eq(user.companyId, row.id));
  }

  await db.delete(companies).where(or(eq(companies.slug, SLUG_A), eq(companies.slug, SLUG_B)));
}

beforeEach(cleanupAll);
afterAll(cleanupAll);

async function fixture(slug: string) {
  const [company] = await db.insert(companies).values({ name: 'Vitest Co', slug }).returning();
  if (!company) throw new Error('fixture company failed');

  const [alice] = await db
    .insert(user)
    .values({
      name: 'Alice',
      email: `vitest-notif-alice-${slug}@nexus.test`,
      emailVerified: true,
      companyId: company.id,
    })
    .returning();
  const [bob] = await db
    .insert(user)
    .values({
      name: 'Bob',
      email: `vitest-notif-bob-${slug}@nexus.test`,
      emailVerified: true,
      companyId: company.id,
    })
    .returning();

  if (!alice || !bob) throw new Error('fixture failed');

  return { company, alice, bob };
}

describe('listNotifications', () => {
  it('only lists the caller’s own notifications, not a colleague’s in the same company', async () => {
    const f = await fixture(SLUG_A);

    await service.createNotification(f.company.id, f.alice.id, { type: 'system', title: 'For Alice' });
    await service.createNotification(f.company.id, f.bob.id, { type: 'system', title: 'For Bob' });

    const page = await service.listNotifications(f.company.id, f.alice.id, { page: 1, pageSize: 25 });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.title).toBe('For Alice');
  });

  it('orders unread before read, then newest first', async () => {
    const f = await fixture(SLUG_A);

    const older = await service.createNotification(f.company.id, f.alice.id, {
      type: 'system',
      title: 'Older, read',
    });
    await service.markNotificationRead(f.company.id, f.alice.id, older.id);
    const newerUnread = await service.createNotification(f.company.id, f.alice.id, {
      type: 'system',
      title: 'Newer, unread',
    });

    const page = await service.listNotifications(f.company.id, f.alice.id, { page: 1, pageSize: 25 });

    expect(page.items[0]?.id).toBe(newerUnread.id);
    expect(page.items[1]?.id).toBe(older.id);
  });

  it('filters to unread only when requested', async () => {
    const f = await fixture(SLUG_A);

    const read = await service.createNotification(f.company.id, f.alice.id, {
      type: 'system',
      title: 'Read one',
    });
    await service.markNotificationRead(f.company.id, f.alice.id, read.id);
    await service.createNotification(f.company.id, f.alice.id, { type: 'system', title: 'Unread one' });

    const page = await service.listNotifications(f.company.id, f.alice.id, {
      page: 1,
      pageSize: 25,
      unreadOnly: true,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.title).toBe('Unread one');
  });
});

describe('markNotificationRead / markNotificationUnread', () => {
  it('toggles readAt', async () => {
    const f = await fixture(SLUG_A);
    const created = await service.createNotification(f.company.id, f.alice.id, {
      type: 'system',
      title: 'Toggle me',
    });

    const read = await service.markNotificationRead(f.company.id, f.alice.id, created.id);
    expect(read.readAt).not.toBeNull();

    const unread = await service.markNotificationUnread(f.company.id, f.alice.id, created.id);
    expect(unread.readAt).toBeNull();
  });

  it('refuses to mark a colleague’s notification read', async () => {
    const f = await fixture(SLUG_A);
    const bobsNotification = await service.createNotification(f.company.id, f.bob.id, {
      type: 'system',
      title: 'Not yours',
    });

    await expect(service.markNotificationRead(f.company.id, f.alice.id, bobsNotification.id)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('refuses to mark another tenant’s notification, even with the right owner id', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);
    const notification = await service.createNotification(b.company.id, b.alice.id, {
      type: 'system',
      title: 'Other tenant',
    });

    await expect(service.markNotificationRead(a.company.id, b.alice.id, notification.id)).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe('markAllNotificationsRead', () => {
  it('marks every unread notification for the caller and returns the count, leaving a colleague’s untouched', async () => {
    const f = await fixture(SLUG_A);

    await service.createNotification(f.company.id, f.alice.id, { type: 'system', title: 'One' });
    await service.createNotification(f.company.id, f.alice.id, { type: 'system', title: 'Two' });
    const bobsNotification = await service.createNotification(f.company.id, f.bob.id, {
      type: 'system',
      title: 'Bob’s',
    });

    const count = await service.markAllNotificationsRead(f.company.id, f.alice.id);

    expect(count).toBe(2);
    expect(await service.countUnread(f.company.id, f.alice.id)).toBe(0);

    const bobsPage = await service.listNotifications(f.company.id, f.bob.id, { page: 1, pageSize: 25 });
    expect(bobsPage.items.find((row) => row.id === bobsNotification.id)?.readAt).toBeNull();
  });
});

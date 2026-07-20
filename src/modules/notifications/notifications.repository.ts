import { and, count, desc, eq, ilike, isNull, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { notifications, type notificationTypeEnum } from '@/db/schema';
import { buildPaginatedResult, toOffset } from '@/lib/helpers';
import type { PaginatedResult, PaginationParams } from '@/types';

/**
 * Notification data access. The only place in the module that touches
 * Drizzle. Every query is scoped by **both** `companyId` and `userId` —
 * unlike every other module, a notification belongs to one person, not the
 * whole tenant, so "my inbox" must never surface a colleague's row.
 */

export type NotificationRow = typeof notifications.$inferSelect;
export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];

const own = (companyId: string, userId: string) =>
  and(eq(notifications.companyId, companyId), eq(notifications.userId, userId)) as SQL;

export interface ListNotificationsQuery extends PaginationParams {
  search?: string;
  unreadOnly?: boolean;
}

export async function listNotifications(
  companyId: string,
  userId: string,
  query: ListNotificationsQuery,
): Promise<PaginatedResult<NotificationRow>> {
  const filters: SQL[] = [own(companyId, userId)];

  if (query.unreadOnly) filters.push(isNull(notifications.readAt));

  if (query.search) {
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    filters.push(ilike(notifications.title, term) as SQL);
  }

  const where = and(...filters) as SQL;

  const [items, [total]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(where)
      // Unread first, then newest — an unread notification from last week should
      // still surface above a read one from this morning.
      .orderBy(sql`${notifications.readAt} is not null`, desc(notifications.createdAt))
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db.select({ value: count() }).from(notifications).where(where),
  ]);

  return buildPaginatedResult(items, total?.value ?? 0, query);
}

export async function countUnread(companyId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(own(companyId, userId), isNull(notifications.readAt)));

  return row?.value ?? 0;
}

export interface NotificationCreateInput {
  type: NotificationType;
  title: string;
  body?: string | null;
  linkPath?: string | null;
  data?: unknown;
}

/**
 * Not called from any Server Action yet — the permission catalogue has no
 * `notifications:create`, because a notification is a system side-effect of
 * another module's action (a task assignment, an invoice being sent), not a
 * thing a user creates directly. Exists for that future call site and for
 * tests to seed rows directly, the same posture Documents' repository takes
 * toward option lists other modules will eventually call through.
 */
export async function create(
  companyId: string,
  userId: string,
  input: NotificationCreateInput,
): Promise<NotificationRow> {
  const [row] = await db
    .insert(notifications)
    .values({ companyId, userId, ...input })
    .returning();

  if (!row) throw new Error('Notification insert returned no row');

  return row;
}

export async function markRead(
  companyId: string,
  userId: string,
  id: string,
): Promise<NotificationRow | null> {
  const [row] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), own(companyId, userId)))
    .returning();

  return row ?? null;
}

export async function markUnread(
  companyId: string,
  userId: string,
  id: string,
): Promise<NotificationRow | null> {
  const [row] = await db
    .update(notifications)
    .set({ readAt: null })
    .where(and(eq(notifications.id, id), own(companyId, userId)))
    .returning();

  return row ?? null;
}

export async function markAllRead(companyId: string, userId: string): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(own(companyId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });

  return rows.length;
}

import 'server-only';

import { NotFoundError } from '@/lib/errors';

import * as repository from './notifications.repository';

export type {
  ListNotificationsQuery,
  NotificationCreateInput,
  NotificationRow,
} from './notifications.repository';

/**
 * Notification rules. Every read and write here is scoped by
 * `(companyId, userId)` — an inbox is personal, not tenant-wide, unlike every
 * other Phase 5 module.
 */

export async function listNotifications(
  companyId: string,
  userId: string,
  query: repository.ListNotificationsQuery,
) {
  return repository.listNotifications(companyId, userId, query);
}

export async function countUnread(companyId: string, userId: string) {
  return repository.countUnread(companyId, userId);
}

export async function createNotification(
  companyId: string,
  userId: string,
  input: repository.NotificationCreateInput,
) {
  return repository.create(companyId, userId, input);
}

export async function markNotificationRead(companyId: string, userId: string, id: string) {
  const updated = await repository.markRead(companyId, userId, id);

  if (!updated) throw new NotFoundError('Notification not found.');

  return updated;
}

export async function markNotificationUnread(companyId: string, userId: string, id: string) {
  const updated = await repository.markUnread(companyId, userId, id);

  if (!updated) throw new NotFoundError('Notification not found.');

  return updated;
}

export async function markAllNotificationsRead(companyId: string, userId: string) {
  return repository.markAllRead(companyId, userId);
}

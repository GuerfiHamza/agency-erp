'use server';

import { revalidatePath } from 'next/cache';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { err, ok, type Result } from '@/types';

import { notificationIdSchema } from './notifications.validation';
import * as service from './notifications.service';

/**
 * Notification Server Actions.
 *
 * Gated by `notifications:update` — there is no `:delete`, matching the
 * catalogue; a notification is marked read/unread, never removed here (see
 * the validation module note).
 */

const NOTIFICATIONS_PATH = '/dashboard/notifications';

export async function markNotificationReadAction(input: unknown): Promise<Result<{ read: true }>> {
  const { companyId, userId } = await requireTenantSession();

  try {
    await requirePermission('notifications:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = notificationIdSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.markNotificationRead(companyId, userId, parsed.data.notificationId);
    revalidatePath(NOTIFICATIONS_PATH);

    return ok({ read: true });
  } catch (error) {
    logger.error('Failed to mark notification read', { error, companyId, userId });
    return err(toErrorPayload(error));
  }
}

export async function markNotificationUnreadAction(input: unknown): Promise<Result<{ read: false }>> {
  const { companyId, userId } = await requireTenantSession();

  try {
    await requirePermission('notifications:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = notificationIdSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.markNotificationUnread(companyId, userId, parsed.data.notificationId);
    revalidatePath(NOTIFICATIONS_PATH);

    return ok({ read: false });
  } catch (error) {
    logger.error('Failed to mark notification unread', { error, companyId, userId });
    return err(toErrorPayload(error));
  }
}

export async function markAllNotificationsReadAction(): Promise<Result<{ count: number }>> {
  const { companyId, userId } = await requireTenantSession();

  try {
    await requirePermission('notifications:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  try {
    const count = await service.markAllNotificationsRead(companyId, userId);
    revalidatePath(NOTIFICATIONS_PATH);

    return ok({ count });
  } catch (error) {
    logger.error('Failed to mark all notifications read', { error, companyId, userId });
    return err(toErrorPayload(error));
  }
}

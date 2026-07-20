import { z } from 'zod';

/**
 * Notification input schemas.
 *
 * There is no create/update form — the permission catalogue only defines
 * `notifications: ['read', 'update']`, matching the schema comment that a
 * notification is dismissed by deletion, never edited. `update` here means
 * "mark read/unread", not "edit content".
 */

export const notificationIdSchema = z.object({ notificationId: z.uuid() });

/**
 * The table's one filter slot is repurposed for "unread only" — the same move
 * Documents made for its `type` facet and Payments for `direction` — since a
 * notification has no status column of its own, only a `readAt` timestamp.
 */
export function toUnreadOnly(values: string[]): boolean {
  return values.includes('unread');
}

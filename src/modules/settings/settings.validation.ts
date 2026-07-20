import { z } from 'zod';

import { notificationTypeEnum } from '@/db/schema';

/**
 * Settings input schemas.
 *
 * This module ships one setting: the company's default notification
 * preferences (`key = 'notifications.preferences'`, `scope = 'company'`).
 * The schema comment on `settings` calls out that shape is enforced here, not
 * by the database — nothing may read `value` without parsing it first.
 *
 * Per-user overrides (`scope = 'user'`) are a real column on the table but a
 * deliberate deferral: this module only ever reads/writes the company-scope
 * row. A self-service "my notification preferences" page is a separate UI
 * decision (does a member get to override, or only see the company default?)
 * left for when that page is actually wanted.
 */

export const NOTIFICATION_PREFERENCES_KEY = 'notifications.preferences';

export const NOTIFICATION_TYPES = notificationTypeEnum.enumValues;

export const notificationPreferencesSchema = z.object(
  Object.fromEntries(NOTIFICATION_TYPES.map((type) => [type, z.boolean()])) as Record<
    (typeof NOTIFICATION_TYPES)[number],
    z.ZodBoolean
  >,
);

export type NotificationPreferences = z.output<typeof notificationPreferencesSchema>;

/** Every notification type enabled — the default before a company ever visits this page. */
export function defaultNotificationPreferences(): NotificationPreferences {
  return Object.fromEntries(NOTIFICATION_TYPES.map((type) => [type, true])) as NotificationPreferences;
}

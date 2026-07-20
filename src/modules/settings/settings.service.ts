import 'server-only';

import * as repository from './settings.repository';
import {
  defaultNotificationPreferences,
  notificationPreferencesSchema,
  NOTIFICATION_PREFERENCES_KEY,
  type NotificationPreferences,
} from './settings.validation';

/**
 * Settings rules. Company-scope only for now (see the validation module
 * note); a company that has never visited this page gets every notification
 * type enabled by default rather than a missing row reading as "off".
 */

export async function getNotificationPreferences(companyId: string): Promise<NotificationPreferences> {
  const stored = await repository.getCompanySetting(companyId, NOTIFICATION_PREFERENCES_KEY);

  if (!stored) return defaultNotificationPreferences();

  const parsed = notificationPreferencesSchema.safeParse(stored);

  // A row that fails to parse (e.g. a type added to the enum since it was
  // last saved) falls back to defaults rather than throwing — a stale
  // settings row must never break the page that reads it.
  return parsed.success ? parsed.data : defaultNotificationPreferences();
}

export async function updateNotificationPreferences(
  companyId: string,
  preferences: NotificationPreferences,
): Promise<void> {
  await repository.upsertCompanySetting(companyId, NOTIFICATION_PREFERENCES_KEY, preferences);
}

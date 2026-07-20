'use server';

import { revalidatePath } from 'next/cache';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { err, ok, type Result } from '@/types';

import * as service from './settings.service';
import { notificationPreferencesSchema } from './settings.validation';

/**
 * Settings Server Actions. Gated by `settings:update` — owner and admin only
 * per the permission catalogue; manager and member hold `settings:read`.
 */

const SETTINGS_PATH = '/dashboard/settings/notifications';

export async function updateNotificationPreferencesAction(
  input: unknown,
): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('settings:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = notificationPreferencesSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.updateNotificationPreferences(companyId, parsed.data);
    revalidatePath(SETTINGS_PATH);

    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update notification preferences', { error, companyId });
    return err(toErrorPayload(error));
  }
}

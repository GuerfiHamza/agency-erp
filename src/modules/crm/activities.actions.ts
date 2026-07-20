'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { err, ok, type Result } from '@/types';

import * as service from './activities.service';
import { activityFormSchema } from './activities.validation';

/**
 * Activity Server Actions. Each re-establishes the session, re-checks its
 * permission, and re-validates its input. The tenant and the author both come
 * from the session, never from the payload.
 */

const ACTIVITIES_PATH = '/dashboard/activities';

const idSchema = z.object({ activityId: z.uuid() });

export async function createActivityAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId, userId } = await requireTenantSession();

  try {
    await requirePermission('activities:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = activityFormSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createActivity(companyId, userId, parsed.data);
    revalidatePath(ACTIVITIES_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create activity', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function updateActivityAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('activities:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.and(activityFormSchema).safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  const { activityId, ...values } = parsed.data;

  try {
    await service.updateActivity(companyId, activityId, values);
    revalidatePath(ACTIVITIES_PATH);

    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update activity', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deleteActivityAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('activities:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deleteActivity(companyId, parsed.data.activityId);
    revalidatePath(ACTIVITIES_PATH);

    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete activity', { error, companyId });
    return err(toErrorPayload(error));
  }
}

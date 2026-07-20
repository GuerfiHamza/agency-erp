'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { err, ok, type Result } from '@/types';

import * as service from './calendar.service';
import { eventFormSchema } from './calendar.validation';

/**
 * Calendar Server Actions. Each re-establishes the session, re-checks its
 * permission, and re-validates its input. The tenant and author come from the
 * session, never from the payload.
 */

const CALENDAR_PATH = '/dashboard/calendar';

const idSchema = z.object({ eventId: z.uuid() });

export async function createEventAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId, userId } = await requireTenantSession();

  try {
    await requirePermission('calendar:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = eventFormSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createEvent(companyId, userId, parsed.data);
    revalidatePath(CALENDAR_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create calendar event', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function updateEventAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('calendar:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  // `eventFormSchema` carries a superRefine, so it cannot be `.merge`d — the id
  // is parsed alongside it instead.
  const parsedId = idSchema.safeParse(input);
  const parsed = eventFormSchema.safeParse(input);

  if (!parsedId.success) return err(toErrorPayload(validationErrorFromZod(parsedId.error)));
  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.updateEvent(companyId, parsedId.data.eventId, parsed.data);
    revalidatePath(CALENDAR_PATH);

    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update calendar event', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deleteEventAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('calendar:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deleteEvent(companyId, parsed.data.eventId);
    revalidatePath(CALENDAR_PATH);

    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete calendar event', { error, companyId });
    return err(toErrorPayload(error));
  }
}

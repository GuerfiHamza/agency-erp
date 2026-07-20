'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { err, ok, type Result } from '@/types';

import * as service from './tasks.service';
import { taskFormSchema } from './tasks.validation';

/**
 * Task Server Actions. Each re-establishes the session, re-checks its
 * permission, and re-validates its input. The tenant and author come from the
 * session, never from the payload.
 */

const TASKS_PATH = '/dashboard/tasks';

const idSchema = z.object({ taskId: z.uuid() });

export async function createTaskAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId, userId } = await requireTenantSession();

  try {
    await requirePermission('tasks:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = taskFormSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createTask(companyId, userId, parsed.data);
    revalidatePath(TASKS_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create task', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function updateTaskAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('tasks:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.merge(taskFormSchema).safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  const { taskId, ...values } = parsed.data;

  try {
    await service.updateTask(companyId, taskId, values);
    revalidatePath(TASKS_PATH);

    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update task', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deleteTaskAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('tasks:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deleteTask(companyId, parsed.data.taskId);
    revalidatePath(TASKS_PATH);

    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete task', { error, companyId });
    return err(toErrorPayload(error));
  }
}

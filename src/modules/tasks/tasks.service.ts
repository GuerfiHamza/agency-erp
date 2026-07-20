import 'server-only';

import { NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';

import * as repository from './tasks.repository';
import { DONE_STATUS, type TaskInput, type TaskStatus } from './tasks.validation';

/**
 * Task rules.
 *
 * Policy here: `completedAt` is derived from the status, `createdById` is the
 * actor on create and never reassigned, and a task's project must belong to this
 * tenant.
 */

export type { TaskListItem, ListTasksQuery } from './tasks.repository';

/** A task is complete exactly when its status is `done`; the date survives edits and clears on reopen. */
function deriveCompletedAt(status: TaskStatus, existingCompletedAt: Date | null): Date | null {
  if (status === DONE_STATUS) return existingCompletedAt ?? new Date();
  return null;
}

async function assertProjectInCompany(companyId: string, projectId: string): Promise<void> {
  if (!(await repository.projectBelongsToCompany(companyId, projectId))) {
    throw new ValidationError('That project does not exist in this workspace.');
  }
}

export async function listTasks(companyId: string, query: repository.ListTasksQuery) {
  return repository.listTasks(companyId, query);
}

export async function getTask(companyId: string, id: string) {
  const found = await repository.findById(companyId, id);

  if (!found) throw new NotFoundError('Task not found.');

  return found;
}

export async function listProjectOptions(companyId: string) {
  return repository.listProjectOptions(companyId);
}

export async function listAssigneeOptions(companyId: string) {
  return repository.listAssigneeOptions(companyId);
}

export async function createTask(companyId: string, actorUserId: string, input: TaskInput) {
  await assertProjectInCompany(companyId, input.projectId);

  const created = await repository.create(companyId, {
    ...input,
    createdById: actorUserId,
    completedAt: deriveCompletedAt(input.status, null),
  });

  logger.info('Task created', { companyId, taskId: created.id });

  return created;
}

export async function updateTask(companyId: string, id: string, input: TaskInput) {
  const existing = await getTask(companyId, id);

  await assertProjectInCompany(companyId, input.projectId);

  const updated = await repository.update(companyId, id, {
    ...input,
    completedAt: deriveCompletedAt(input.status, existing.completedAt),
  });

  if (!updated) throw new NotFoundError('Task not found.');

  logger.info('Task updated', { companyId, taskId: id });

  return updated;
}

export async function deleteTask(companyId: string, id: string) {
  const deleted = await repository.softDelete(companyId, id);

  if (!deleted) throw new NotFoundError('Task not found.');

  logger.info('Task deleted', { companyId, taskId: id });

  return deleted;
}

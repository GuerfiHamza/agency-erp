import { alias } from 'drizzle-orm/pg-core';
import { and, asc, count, desc, eq, getTableColumns, ilike, inArray, isNull, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { projects, tasks, user } from '@/db/schema';
import { buildPaginatedResult, toOffset } from '@/lib/helpers';
import type { PaginatedResult, PaginationParams, SortDirection } from '@/types';

import type { TaskInput, TaskSortField, TaskStatus } from './tasks.validation';

/**
 * Task data access. The only place in the module that touches Drizzle.
 *
 * Scoped by `companyId`, filters `deleted_at IS NULL`. Not `server-only`:
 * scripts and tests import it, and the ESLint boundary stops UI reaching `@/db`.
 */

export type TaskRow = typeof tasks.$inferSelect;

/** The list row: the task plus the project and assignee names in one round trip. */
export type TaskListItem = TaskRow & { projectName: string; assigneeName: string | null };

/** Create needs the actor and the derived completedAt on top of the form input. */
export type TaskCreateWrite = TaskInput & { createdById: string | null; completedAt: Date | null };
/** Update sets completedAt but never re-attributes `createdById`. */
export type TaskUpdateWrite = TaskInput & { completedAt: Date | null };

const liveTask = (companyId: string) => and(eq(tasks.companyId, companyId), isNull(tasks.deletedAt)) as SQL;

const SORT_COLUMNS = {
  title: tasks.title,
  status: tasks.status,
  dueDate: tasks.dueDate,
  createdAt: tasks.createdAt,
} as const;

const assignee = alias(user, 'assignee');

export interface ListTasksQuery extends PaginationParams {
  search?: string;
  sort?: { field: TaskSortField; direction: SortDirection };
  statuses?: TaskStatus[];
}

const SELECTION = { ...getTableColumns(tasks), projectName: projects.name, assigneeName: assignee.name };

export async function listTasks(
  companyId: string,
  query: ListTasksQuery,
): Promise<PaginatedResult<TaskListItem>> {
  const filters: SQL[] = [liveTask(companyId)];

  if (query.search) {
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    filters.push(ilike(tasks.title, term));
  }

  if (query.statuses && query.statuses.length > 0) {
    filters.push(inArray(tasks.status, query.statuses));
  }

  const where = and(...filters);

  // Default view is by due date, soonest first; Postgres sorts NULL due dates
  // last on ASC, so undated tasks fall to the bottom where they belong.
  const sortColumn = SORT_COLUMNS[query.sort?.field ?? 'dueDate'];
  const direction = query.sort?.direction === 'desc' ? desc : asc;

  const [items, [total]] = await Promise.all([
    db
      .select(SELECTION)
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
      .where(where)
      .orderBy(direction(sortColumn), asc(tasks.id))
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db.select({ value: count() }).from(tasks).where(where),
  ]);

  return buildPaginatedResult(items, total?.value ?? 0, query);
}

export async function findById(companyId: string, id: string): Promise<TaskListItem | null> {
  const [row] = await db
    .select(SELECTION)
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
    .where(and(eq(tasks.id, id), liveTask(companyId)))
    .limit(1);

  return row ?? null;
}

/** Confirm a project belongs to this company and is live — the tenant boundary the FK can't check. */
export async function projectBelongsToCompany(companyId: string, projectId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.companyId, companyId), isNull(projects.deletedAt)))
    .limit(1);

  return Boolean(row);
}

export async function create(companyId: string, values: TaskCreateWrite): Promise<TaskRow> {
  const [row] = await db
    .insert(tasks)
    .values({ ...values, companyId })
    .returning();

  if (!row) throw new Error('Task insert returned no row');

  return row;
}

export async function update(
  companyId: string,
  id: string,
  values: TaskUpdateWrite,
): Promise<TaskRow | null> {
  const [row] = await db
    .update(tasks)
    .set(values)
    .where(and(eq(tasks.id, id), liveTask(companyId)))
    .returning();

  return row ?? null;
}

export async function softDelete(companyId: string, id: string): Promise<TaskRow | null> {
  const [row] = await db
    .update(tasks)
    .set({ deletedAt: new Date() })
    .where(and(eq(tasks.id, id), liveTask(companyId)))
    .returning();

  return row ?? null;
}

export async function listProjectOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.companyId, companyId), isNull(projects.deletedAt)))
    .orderBy(asc(projects.name));
}

export async function listAssigneeOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(eq(user.companyId, companyId), eq(user.isActive, true), isNull(user.deletedAt)))
    .orderBy(asc(user.name));
}

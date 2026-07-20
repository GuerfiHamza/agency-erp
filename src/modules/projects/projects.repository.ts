import { alias } from 'drizzle-orm/pg-core';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNull,
  or,
  type SQL,
} from 'drizzle-orm';

import { db } from '@/db';
import { clients, projects, user } from '@/db/schema';
import { buildPaginatedResult, toOffset } from '@/lib/helpers';
import type { PaginatedResult, PaginationParams, SortDirection } from '@/types';

import type { ProjectInput, ProjectSortField, ProjectStatus } from './projects.validation';

/**
 * Project data access. The only place in the module that touches Drizzle.
 *
 * Scoped by `companyId`, filters `deleted_at IS NULL`. Not `server-only`:
 * scripts and tests import it, and the ESLint boundary stops UI reaching `@/db`.
 */

export type ProjectRow = typeof projects.$inferSelect;

/** The list row: the project plus the client and manager names in one round trip. */
export type ProjectListItem = ProjectRow & { clientName: string | null; managerName: string | null };

/** Create needs the generated code and derived completedAt on top of the form input. */
export type ProjectCreateWrite = ProjectInput & { code: string; completedAt: Date | null };
/** Update never touches `code` — it is a stable reference — but does set completedAt. */
export type ProjectUpdateWrite = ProjectInput & { completedAt: Date | null };

const liveProject = (companyId: string) =>
  and(eq(projects.companyId, companyId), isNull(projects.deletedAt)) as SQL;

const SORT_COLUMNS = {
  name: projects.name,
  code: projects.code,
  status: projects.status,
  createdAt: projects.createdAt,
} as const;

const manager = alias(user, 'manager');

export interface ListProjectsQuery extends PaginationParams {
  search?: string;
  sort?: { field: ProjectSortField; direction: SortDirection };
  statuses?: ProjectStatus[];
}

const SELECTION = { ...getTableColumns(projects), clientName: clients.name, managerName: manager.name };

export async function listProjects(
  companyId: string,
  query: ListProjectsQuery,
): Promise<PaginatedResult<ProjectListItem>> {
  const filters: SQL[] = [liveProject(companyId)];

  if (query.search) {
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    filters.push(or(ilike(projects.name, term), ilike(projects.code, term)) as SQL);
  }

  if (query.statuses && query.statuses.length > 0) {
    filters.push(inArray(projects.status, query.statuses));
  }

  const where = and(...filters);

  const sortColumn = SORT_COLUMNS[query.sort?.field ?? 'createdAt'];
  const direction = query.sort?.direction === 'asc' ? asc : desc;

  const [items, [total]] = await Promise.all([
    db
      .select(SELECTION)
      .from(projects)
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(manager, eq(manager.id, projects.managerId))
      .where(where)
      .orderBy(direction(sortColumn), asc(projects.id))
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db.select({ value: count() }).from(projects).where(where),
  ]);

  return buildPaginatedResult(items, total?.value ?? 0, query);
}

export async function findById(companyId: string, id: string): Promise<ProjectListItem | null> {
  const [row] = await db
    .select(SELECTION)
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .leftJoin(manager, eq(manager.id, projects.managerId))
    .where(and(eq(projects.id, id), liveProject(companyId)))
    .limit(1);

  return row ?? null;
}

/** Confirm a client belongs to this company and is live — the tenant boundary the FK can't check. */
export async function clientBelongsToCompany(companyId: string, clientId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.companyId, companyId), isNull(clients.deletedAt)))
    .limit(1);

  return Boolean(row);
}

/** Total projects ever created for a company (including soft-deleted) — the code seed. */
export async function countAllProjects(companyId: string): Promise<number> {
  const [row] = await db.select({ value: count() }).from(projects).where(eq(projects.companyId, companyId));
  return row?.value ?? 0;
}

/** Is a code already taken by a live project? Matches the partial unique index. */
export async function isCodeTaken(companyId: string, code: string): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.companyId, companyId), eq(projects.code, code), isNull(projects.deletedAt)))
    .limit(1);

  return Boolean(row);
}

export async function create(companyId: string, values: ProjectCreateWrite): Promise<ProjectRow> {
  const [row] = await db
    .insert(projects)
    .values({ ...values, companyId })
    .returning();

  if (!row) throw new Error('Project insert returned no row');

  return row;
}

export async function update(
  companyId: string,
  id: string,
  values: ProjectUpdateWrite,
): Promise<ProjectRow | null> {
  const [row] = await db
    .update(projects)
    .set(values)
    .where(and(eq(projects.id, id), liveProject(companyId)))
    .returning();

  return row ?? null;
}

export async function softDelete(companyId: string, id: string): Promise<ProjectRow | null> {
  const [row] = await db
    .update(projects)
    .set({ deletedAt: new Date() })
    .where(and(eq(projects.id, id), liveProject(companyId)))
    .returning();

  return row ?? null;
}

export async function listClientOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(eq(clients.companyId, companyId), isNull(clients.deletedAt)))
    .orderBy(asc(clients.name));
}

export async function listManagerOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(eq(user.companyId, companyId), eq(user.isActive, true), isNull(user.deletedAt)))
    .orderBy(asc(user.name));
}

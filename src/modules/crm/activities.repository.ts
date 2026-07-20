import { and, asc, count, desc, eq, getTableColumns, ilike, inArray, isNull, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { activities, clients, leads, opportunities, user } from '@/db/schema';
import { buildPaginatedResult, toOffset } from '@/lib/helpers';
import type { PaginatedResult, PaginationParams, SortDirection } from '@/types';

import type { ActivitySortField, ActivityType, RelatedKind } from './activities.validation';

/**
 * Activity data access. The only place in the module that touches Drizzle.
 *
 * Scoped by `companyId`, filters `deleted_at IS NULL`. Not `server-only`:
 * scripts and tests import it, and the ESLint boundary stops UI reaching `@/db`.
 */

export type ActivityRow = typeof activities.$inferSelect;

/** The list row: the activity plus a resolved label for whatever it links to. */
export type ActivityListItem = ActivityRow & {
  relatedKind: RelatedKind;
  relatedLabel: string | null;
  createdByName: string | null;
};

/** What the repository writes: the resolved columns, not the form's kind/id pair. */
export interface ActivityWrite {
  type: ActivityType;
  subject: string;
  body: string | null;
  occurredAt: Date;
  /** Nullable: the original author may have since been deleted (`set null`). */
  createdById: string | null;
  leadId: string | null;
  clientId: string | null;
  opportunityId: string | null;
}

const liveActivity = (companyId: string) =>
  and(eq(activities.companyId, companyId), isNull(activities.deletedAt)) as SQL;

const SORT_COLUMNS = {
  subject: activities.subject,
  occurredAt: activities.occurredAt,
  createdAt: activities.createdAt,
} as const;

export interface ListActivitiesQuery extends PaginationParams {
  search?: string;
  sort?: { field: ActivitySortField; direction: SortDirection };
  types?: ActivityType[];
}

const SELECTION = {
  ...getTableColumns(activities),
  leadName: leads.name,
  clientName: clients.name,
  opportunityName: opportunities.name,
  createdByName: user.name,
};

/** Turn the three joined names into the single label the UI shows. */
function toListItem(
  row: {
    leadName: string | null;
    clientName: string | null;
    opportunityName: string | null;
  } & ActivityRow & { createdByName: string | null },
): ActivityListItem {
  const { leadName, clientName, opportunityName, ...rest } = row;

  const [relatedKind, relatedLabel]: [RelatedKind, string | null] = leadName
    ? ['lead', leadName]
    : clientName
      ? ['client', clientName]
      : opportunityName
        ? ['opportunity', opportunityName]
        : ['none', null];

  return { ...rest, relatedKind, relatedLabel };
}

export async function listActivities(
  companyId: string,
  query: ListActivitiesQuery,
): Promise<PaginatedResult<ActivityListItem>> {
  const filters: SQL[] = [liveActivity(companyId)];

  if (query.search) {
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    filters.push(ilike(activities.subject, term));
  }

  if (query.types && query.types.length > 0) {
    filters.push(inArray(activities.type, query.types));
  }

  const where = and(...filters);

  // Timeline default: most recent first.
  const sortColumn = SORT_COLUMNS[query.sort?.field ?? 'occurredAt'];
  const direction = query.sort?.direction === 'asc' ? asc : desc;

  const [items, [total]] = await Promise.all([
    db
      .select(SELECTION)
      .from(activities)
      .leftJoin(leads, eq(leads.id, activities.leadId))
      .leftJoin(clients, eq(clients.id, activities.clientId))
      .leftJoin(opportunities, eq(opportunities.id, activities.opportunityId))
      .leftJoin(user, eq(user.id, activities.createdById))
      .where(where)
      .orderBy(direction(sortColumn), asc(activities.id))
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db.select({ value: count() }).from(activities).where(where),
  ]);

  return buildPaginatedResult(items.map(toListItem), total?.value ?? 0, query);
}

export async function findById(companyId: string, id: string): Promise<ActivityListItem | null> {
  const [row] = await db
    .select(SELECTION)
    .from(activities)
    .leftJoin(leads, eq(leads.id, activities.leadId))
    .leftJoin(clients, eq(clients.id, activities.clientId))
    .leftJoin(opportunities, eq(opportunities.id, activities.opportunityId))
    .leftJoin(user, eq(user.id, activities.createdById))
    .where(and(eq(activities.id, id), liveActivity(companyId)))
    .limit(1);

  return row ? toListItem(row) : null;
}

/** Does a lead/client/opportunity with this id exist in this company? Guards the tenant boundary. */
export async function relatedExists(
  companyId: string,
  kind: Exclude<RelatedKind, 'none'>,
  id: string,
): Promise<boolean> {
  const table = kind === 'lead' ? leads : kind === 'client' ? clients : opportunities;

  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.companyId, companyId), isNull(table.deletedAt)))
    .limit(1);

  return Boolean(row);
}

export async function create(companyId: string, values: ActivityWrite): Promise<ActivityRow> {
  const [row] = await db
    .insert(activities)
    .values({ ...values, companyId })
    .returning();

  if (!row) throw new Error('Activity insert returned no row');

  return row;
}

export async function update(
  companyId: string,
  id: string,
  values: ActivityWrite,
): Promise<ActivityRow | null> {
  const [row] = await db
    .update(activities)
    .set(values)
    .where(and(eq(activities.id, id), liveActivity(companyId)))
    .returning();

  return row ?? null;
}

export async function softDelete(companyId: string, id: string): Promise<ActivityRow | null> {
  const [row] = await db
    .update(activities)
    .set({ deletedAt: new Date() })
    .where(and(eq(activities.id, id), liveActivity(companyId)))
    .returning();

  return row ?? null;
}

export async function listLeadOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: leads.id, name: leads.name })
    .from(leads)
    .where(and(eq(leads.companyId, companyId), isNull(leads.deletedAt)))
    .orderBy(asc(leads.name));
}

export async function listClientOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(eq(clients.companyId, companyId), isNull(clients.deletedAt)))
    .orderBy(asc(clients.name));
}

export async function listOpportunityOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: opportunities.id, name: opportunities.name })
    .from(opportunities)
    .where(and(eq(opportunities.companyId, companyId), isNull(opportunities.deletedAt)))
    .orderBy(asc(opportunities.name));
}

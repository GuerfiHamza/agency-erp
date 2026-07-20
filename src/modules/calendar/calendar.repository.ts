import { and, asc, eq, getTableColumns, gte, isNull, lte, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { calendarEvents, clients, projects, tasks } from '@/db/schema';

import type { EventInput, EventLinkKind } from './calendar.validation';

/**
 * Calendar data access. The only place in the module that touches Drizzle.
 *
 * Scoped by `companyId`, filters `deleted_at IS NULL`. Not `server-only`:
 * scripts and tests import it, and the ESLint boundary stops UI reaching `@/db`.
 */

export type EventRow = typeof calendarEvents.$inferSelect;

/** The rendered event: the row plus its link resolved to one kind + label. */
export type EventListItem = EventRow & {
  linkedKind: EventLinkKind;
  linkedLabel: string | null;
};

/** The link as columns — exactly one non-null, or all null. */
export interface LinkColumns {
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
}

export type EventCreateWrite = Omit<EventInput, 'linkKind' | 'linkId'> &
  LinkColumns & { createdById: string | null };

export type EventUpdateWrite = Omit<EventInput, 'linkKind' | 'linkId'> & LinkColumns;

const liveEvent = (companyId: string) =>
  and(eq(calendarEvents.companyId, companyId), isNull(calendarEvents.deletedAt)) as SQL;

const SELECTION = {
  ...getTableColumns(calendarEvents),
  clientName: clients.name,
  projectName: projects.name,
  taskTitle: tasks.title,
};

type SelectedRow = EventRow & {
  clientName: string | null;
  projectName: string | null;
  taskTitle: string | null;
};

/** Collapse the three nullable targets back into one kind + label for display. */
function toListItem(row: SelectedRow): EventListItem {
  const { clientName, projectName, taskTitle, ...event } = row;

  if (event.clientId) return { ...event, linkedKind: 'client', linkedLabel: clientName };
  if (event.projectId) return { ...event, linkedKind: 'project', linkedLabel: projectName };
  if (event.taskId) return { ...event, linkedKind: 'task', linkedLabel: taskTitle };

  return { ...event, linkedKind: 'none', linkedLabel: null };
}

function withLinks() {
  return db
    .select(SELECTION)
    .from(calendarEvents)
    .leftJoin(clients, eq(clients.id, calendarEvents.clientId))
    .leftJoin(projects, eq(projects.id, calendarEvents.projectId))
    .leftJoin(tasks, eq(tasks.id, calendarEvents.taskId));
}

/**
 * Every event that starts inside the window, oldest first.
 *
 * Deliberately keyed on `startsAt` alone — that is the column the range index
 * covers. An event that started before the window and runs into it is missed;
 * catching those needs an overlap predicate (`startsAt < to AND endsAt > from`),
 * which the index cannot serve. ponytail: agency events are hours, not weeks —
 * revisit when multi-day events are common.
 */
export async function listEventsInRange(companyId: string, from: Date, to: Date): Promise<EventListItem[]> {
  const rows = await withLinks()
    .where(and(liveEvent(companyId), gte(calendarEvents.startsAt, from), lte(calendarEvents.startsAt, to)))
    .orderBy(asc(calendarEvents.startsAt), asc(calendarEvents.id));

  return rows.map(toListItem);
}

export async function findById(companyId: string, id: string): Promise<EventListItem | null> {
  const [row] = await withLinks()
    .where(and(eq(calendarEvents.id, id), liveEvent(companyId)))
    .limit(1);

  return row ? toListItem(row) : null;
}

/** Confirm a link target belongs to this company and is live — the tenant boundary the FK can't check. */
export async function linkExists(
  companyId: string,
  kind: Exclude<EventLinkKind, 'none'>,
  id: string,
): Promise<boolean> {
  const table = { client: clients, project: projects, task: tasks }[kind];

  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.companyId, companyId), isNull(table.deletedAt)))
    .limit(1);

  return Boolean(row);
}

export async function create(companyId: string, values: EventCreateWrite): Promise<EventRow> {
  const [row] = await db
    .insert(calendarEvents)
    .values({ ...values, companyId })
    .returning();

  if (!row) throw new Error('Calendar event insert returned no row');

  return row;
}

export async function update(
  companyId: string,
  id: string,
  values: EventUpdateWrite,
): Promise<EventRow | null> {
  const [row] = await db
    .update(calendarEvents)
    .set(values)
    .where(and(eq(calendarEvents.id, id), liveEvent(companyId)))
    .returning();

  return row ?? null;
}

export async function softDelete(companyId: string, id: string): Promise<EventRow | null> {
  const [row] = await db
    .update(calendarEvents)
    .set({ deletedAt: new Date() })
    .where(and(eq(calendarEvents.id, id), liveEvent(companyId)))
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

export async function listProjectOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.companyId, companyId), isNull(projects.deletedAt)))
    .orderBy(asc(projects.name));
}

export async function listTaskOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: tasks.id, name: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.companyId, companyId), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.title));
}

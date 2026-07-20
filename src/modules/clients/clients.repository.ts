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
  sql,
  type SQL,
} from 'drizzle-orm';

import { db } from '@/db';
import { clients, user } from '@/db/schema';
import { buildPaginatedResult, toOffset } from '@/lib/helpers';
import type { PaginatedResult, PaginationParams, SortDirection } from '@/types';

import type { ClientInput, ClientSortField, ClientStatus } from './clients.validation';

/**
 * Client data access. The only place in the module that touches Drizzle.
 *
 * Every query is scoped by `companyId` — the tenant boundary — and filters
 * `deleted_at IS NULL`. Not marked `server-only`: the same reason as the other
 * repositories, scripts and tests import it, and the ESLint boundary already
 * stops UI reaching `@/db`.
 */

export type ClientRow = typeof clients.$inferSelect;

/** A client as the list shows them: the full row plus the owner's name in one round trip. */
export type ClientListItem = ClientRow & { ownerName: string | null };

const liveClient = (companyId: string) =>
  and(eq(clients.companyId, companyId), isNull(clients.deletedAt)) as SQL;

const SORT_COLUMNS = {
  name: clients.name,
  status: clients.status,
  createdAt: clients.createdAt,
} as const;

export interface ListClientsQuery extends PaginationParams {
  search?: string;
  sort?: { field: ClientSortField; direction: SortDirection };
  statuses?: ClientStatus[];
}

/** Shared WHERE for the paginated list and the unpaginated export, so they never diverge. */
function buildFilters(companyId: string, query: Pick<ListClientsQuery, 'search' | 'statuses'>): SQL {
  const filters: SQL[] = [liveClient(companyId)];

  if (query.search) {
    // Escape LIKE metacharacters: a search for "100%" must not match everything.
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    filters.push(
      or(ilike(clients.name, term), ilike(clients.email, term), ilike(clients.legalName, term)) as SQL,
    );
  }

  if (query.statuses && query.statuses.length > 0) {
    filters.push(inArray(clients.status, query.statuses));
  }

  return and(...filters) as SQL;
}

export async function listClients(
  companyId: string,
  query: ListClientsQuery,
): Promise<PaginatedResult<ClientListItem>> {
  const where = buildFilters(companyId, query);

  const sortColumn = SORT_COLUMNS[query.sort?.field ?? 'name'];
  const direction = query.sort?.direction === 'desc' ? desc : asc;

  const [items, [total]] = await Promise.all([
    db
      .select({ ...getTableColumns(clients), ownerName: user.name })
      .from(clients)
      .leftJoin(user, eq(user.id, clients.ownerId))
      .where(where)
      // Stable tiebreak on id: without it two clients with the same name can swap
      // places between pages and one is never shown.
      .orderBy(direction(sortColumn), asc(clients.id))
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db.select({ value: count() }).from(clients).where(where),
  ]);

  return buildPaginatedResult(items, total?.value ?? 0, query);
}

/** One client, scoped to the company. `null` when missing, deleted, or another tenant's. */
export async function findById(companyId: string, clientId: string): Promise<ClientListItem | null> {
  const [row] = await db
    .select({ ...getTableColumns(clients), ownerName: user.name })
    .from(clients)
    .leftJoin(user, eq(user.id, clients.ownerId))
    .where(and(eq(clients.id, clientId), liveClient(companyId)))
    .limit(1);

  return row ?? null;
}

export async function create(companyId: string, values: ClientInput): Promise<ClientRow> {
  const [row] = await db
    .insert(clients)
    .values({ ...values, companyId })
    .returning();

  if (!row) throw new Error('Client insert returned no row');

  return row;
}

export async function update(
  companyId: string,
  clientId: string,
  values: ClientInput,
): Promise<ClientRow | null> {
  const [row] = await db
    .update(clients)
    .set(values)
    .where(and(eq(clients.id, clientId), liveClient(companyId)))
    .returning();

  return row ?? null;
}

export async function softDelete(companyId: string, clientId: string): Promise<ClientRow | null> {
  const [row] = await db
    .update(clients)
    .set({ deletedAt: new Date() })
    .where(and(eq(clients.id, clientId), liveClient(companyId)))
    .returning();

  return row ?? null;
}

/** Active people who can be a client's account manager. */
export async function listOwnerOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(eq(user.companyId, companyId), eq(user.isActive, true), isNull(user.deletedAt)))
    .orderBy(asc(user.name));
}

/** Cap on export size — a link that streams an unbounded table is a way to fall over. */
const EXPORT_LIMIT = 5000;

export interface ClientExportRow {
  name: string;
  type: string;
  status: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  ownerName: string | null;
  createdAt: Date;
}

/**
 * Rows matching the same filters as the list, without pagination, for CSV export.
 * ponytail: hard cap at EXPORT_LIMIT; stream in chunks only if a tenant ever
 * exceeds it, which for an agency's client list is years away.
 */
export async function exportRows(
  companyId: string,
  query: Pick<ListClientsQuery, 'search' | 'statuses' | 'sort'>,
): Promise<ClientExportRow[]> {
  const where = buildFilters(companyId, query);
  const sortColumn = SORT_COLUMNS[query.sort?.field ?? 'name'];
  const direction = query.sort?.direction === 'desc' ? desc : asc;

  return db
    .select({
      name: clients.name,
      type: sql<string>`${clients.type}`,
      status: sql<string>`${clients.status}`,
      email: clients.email,
      phone: clients.phone,
      website: clients.website,
      city: clients.city,
      country: clients.country,
      ownerName: user.name,
      createdAt: clients.createdAt,
    })
    .from(clients)
    .leftJoin(user, eq(user.id, clients.ownerId))
    .where(where)
    .orderBy(direction(sortColumn), asc(clients.id))
    .limit(EXPORT_LIMIT);
}

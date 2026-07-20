import { alias } from 'drizzle-orm/pg-core';
import { and, asc, count, desc, eq, getTableColumns, ilike, inArray, isNull, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { clients, contacts, opportunities, user } from '@/db/schema';
import { buildPaginatedResult, toOffset } from '@/lib/helpers';
import type { PaginatedResult, PaginationParams, SortDirection } from '@/types';

import type { OpportunityInput, OpportunitySortField, OpportunityStage } from './opportunities.validation';

/**
 * Opportunity data access. The only place in the module that touches Drizzle.
 *
 * Scoped by `companyId`, filters `deleted_at IS NULL`. Not `server-only`:
 * scripts and tests import it, and the ESLint boundary stops UI reaching `@/db`.
 */

export type OpportunityRow = typeof opportunities.$inferSelect;

/** The list row: the full opportunity plus the client and owner names in one round trip. */
export type OpportunityListItem = OpportunityRow & { clientName: string; ownerName: string | null };

/** What the repository writes: form input plus the service-derived `closedAt`. */
export type OpportunityWrite = OpportunityInput & { closedAt: Date | null };

const liveOpportunity = (companyId: string) =>
  and(eq(opportunities.companyId, companyId), isNull(opportunities.deletedAt)) as SQL;

const SORT_COLUMNS = {
  name: opportunities.name,
  stage: opportunities.stage,
  createdAt: opportunities.createdAt,
} as const;

// The owner is a `user`; the client join also reaches `user` is not needed, but
// alias keeps the two person/name joins unambiguous if that changes.
const owner = alias(user, 'owner');

export interface ListOpportunitiesQuery extends PaginationParams {
  search?: string;
  sort?: { field: OpportunitySortField; direction: SortDirection };
  stages?: OpportunityStage[];
}

export async function listOpportunities(
  companyId: string,
  query: ListOpportunitiesQuery,
): Promise<PaginatedResult<OpportunityListItem>> {
  const filters: SQL[] = [liveOpportunity(companyId)];

  if (query.search) {
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    filters.push(ilike(opportunities.name, term));
  }

  if (query.stages && query.stages.length > 0) {
    filters.push(inArray(opportunities.stage, query.stages));
  }

  const where = and(...filters);

  const sortColumn = SORT_COLUMNS[query.sort?.field ?? 'name'];
  const direction = query.sort?.direction === 'desc' ? desc : asc;

  const [items, [total]] = await Promise.all([
    db
      .select({ ...getTableColumns(opportunities), clientName: clients.name, ownerName: owner.name })
      .from(opportunities)
      .innerJoin(clients, eq(clients.id, opportunities.clientId))
      .leftJoin(owner, eq(owner.id, opportunities.ownerId))
      .where(where)
      .orderBy(direction(sortColumn), asc(opportunities.id))
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db.select({ value: count() }).from(opportunities).where(where),
  ]);

  return buildPaginatedResult(items, total?.value ?? 0, query);
}

export async function findById(companyId: string, id: string): Promise<OpportunityListItem | null> {
  const [row] = await db
    .select({ ...getTableColumns(opportunities), clientName: clients.name, ownerName: owner.name })
    .from(opportunities)
    .innerJoin(clients, eq(clients.id, opportunities.clientId))
    .leftJoin(owner, eq(owner.id, opportunities.ownerId))
    .where(and(eq(opportunities.id, id), liveOpportunity(companyId)))
    .limit(1);

  return row ?? null;
}

/**
 * Confirm a client id belongs to this company and is live.
 *
 * The DB foreign key guarantees the client exists, but not that it is *this*
 * tenant's — without this check a posted client id from another company would be
 * accepted, linking an opportunity across the tenant boundary.
 */
export async function clientBelongsToCompany(companyId: string, clientId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.companyId, companyId), isNull(clients.deletedAt)))
    .limit(1);

  return Boolean(row);
}

export async function create(companyId: string, values: OpportunityWrite): Promise<OpportunityRow> {
  const [row] = await db
    .insert(opportunities)
    .values({ ...values, companyId })
    .returning();

  if (!row) throw new Error('Opportunity insert returned no row');

  return row;
}

export async function update(
  companyId: string,
  id: string,
  values: OpportunityWrite,
): Promise<OpportunityRow | null> {
  const [row] = await db
    .update(opportunities)
    .set(values)
    .where(and(eq(opportunities.id, id), liveOpportunity(companyId)))
    .returning();

  return row ?? null;
}

export async function softDelete(companyId: string, id: string): Promise<OpportunityRow | null> {
  const [row] = await db
    .update(opportunities)
    .set({ deletedAt: new Date() })
    .where(and(eq(opportunities.id, id), liveOpportunity(companyId)))
    .returning();

  return row ?? null;
}

/** Live clients to attach an opportunity to. */
export async function listClientOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(eq(clients.companyId, companyId), isNull(clients.deletedAt)))
    .orderBy(asc(clients.name));
}

/** Active people who can own an opportunity. */
export async function listOwnerOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(eq(user.companyId, companyId), eq(user.isActive, true), isNull(user.deletedAt)))
    .orderBy(asc(user.name));
}

/**
 * All contacts in the company, tagged with their client, for the dependent
 * contact picker. The form filters this by the chosen client, so one query
 * feeds every client's list rather than a fetch per client selection.
 */
export async function listContactsByClient(
  companyId: string,
): Promise<{ clientId: string; id: string; name: string }[]> {
  const rows = await db
    .select({
      clientId: contacts.clientId,
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(contacts)
    .where(and(eq(contacts.companyId, companyId), isNull(contacts.deletedAt)))
    .orderBy(asc(contacts.firstName));

  return rows.map((row) => ({
    clientId: row.clientId,
    id: row.id,
    name: [row.firstName, row.lastName].filter(Boolean).join(' '),
  }));
}

/** Confirm a contact belongs to the given client in this company — the tenant/parent boundary. */
export async function contactBelongsToClient(
  companyId: string,
  clientId: string,
  contactId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.clientId, clientId),
        eq(contacts.companyId, companyId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);

  return Boolean(row);
}

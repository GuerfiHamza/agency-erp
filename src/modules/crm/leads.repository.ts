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
import { clients, leads, user } from '@/db/schema';
import { buildPaginatedResult, toOffset } from '@/lib/helpers';
import type { PaginatedResult, PaginationParams, SortDirection } from '@/types';

import type { LeadInput, LeadSortField, LeadStatus } from './leads.validation';

/**
 * Lead data access. The only place in the module that touches Drizzle.
 *
 * Every query is scoped by `companyId` and filters `deleted_at IS NULL`. Not
 * marked `server-only`: scripts and tests import it, and the ESLint boundary
 * already stops UI reaching `@/db`.
 */

export type LeadRow = typeof leads.$inferSelect;

/** A lead as the list shows them: the full row plus the owner's name in one round trip. */
export type LeadListItem = LeadRow & { ownerName: string | null };

const liveLead = (companyId: string) => and(eq(leads.companyId, companyId), isNull(leads.deletedAt)) as SQL;

const SORT_COLUMNS = {
  name: leads.name,
  status: leads.status,
  createdAt: leads.createdAt,
} as const;

export interface ListLeadsQuery extends PaginationParams {
  search?: string;
  sort?: { field: LeadSortField; direction: SortDirection };
  statuses?: LeadStatus[];
}

export async function listLeads(
  companyId: string,
  query: ListLeadsQuery,
): Promise<PaginatedResult<LeadListItem>> {
  const filters: SQL[] = [liveLead(companyId)];

  if (query.search) {
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    filters.push(
      or(ilike(leads.name, term), ilike(leads.email, term), ilike(leads.companyName, term)) as SQL,
    );
  }

  if (query.statuses && query.statuses.length > 0) {
    filters.push(inArray(leads.status, query.statuses));
  }

  const where = and(...filters);

  const sortColumn = SORT_COLUMNS[query.sort?.field ?? 'name'];
  const direction = query.sort?.direction === 'desc' ? desc : asc;

  const [items, [total]] = await Promise.all([
    db
      .select({ ...getTableColumns(leads), ownerName: user.name })
      .from(leads)
      .leftJoin(user, eq(user.id, leads.ownerId))
      .where(where)
      .orderBy(direction(sortColumn), asc(leads.id))
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db.select({ value: count() }).from(leads).where(where),
  ]);

  return buildPaginatedResult(items, total?.value ?? 0, query);
}

/** One lead, scoped to the company. `null` when missing, deleted, or another tenant's. */
export async function findById(companyId: string, leadId: string): Promise<LeadListItem | null> {
  const [row] = await db
    .select({ ...getTableColumns(leads), ownerName: user.name })
    .from(leads)
    .leftJoin(user, eq(user.id, leads.ownerId))
    .where(and(eq(leads.id, leadId), liveLead(companyId)))
    .limit(1);

  return row ?? null;
}

export async function create(companyId: string, values: LeadInput): Promise<LeadRow> {
  const [row] = await db
    .insert(leads)
    .values({ ...values, companyId })
    .returning();

  if (!row) throw new Error('Lead insert returned no row');

  return row;
}

export async function update(companyId: string, leadId: string, values: LeadInput): Promise<LeadRow | null> {
  const [row] = await db
    .update(leads)
    .set(values)
    .where(and(eq(leads.id, leadId), liveLead(companyId)))
    .returning();

  return row ?? null;
}

export async function softDelete(companyId: string, leadId: string): Promise<LeadRow | null> {
  const [row] = await db
    .update(leads)
    .set({ deletedAt: new Date() })
    .where(and(eq(leads.id, leadId), liveLead(companyId)))
    .returning();

  return row ?? null;
}

export interface ConvertResult {
  clientId: string;
}

/**
 * Convert a lead into a client, in one transaction.
 *
 * Both writes land or neither does: a client is created from the lead's details
 * and the lead is stamped with `convertedClientId` / `convertedAt` / status. The
 * lead row is kept (not deleted) so the funnel report can still count it — see
 * the schema comment. Returns `null` if the lead is missing, already converted,
 * or another tenant's, so the caller can 404/409 rather than double-convert.
 */
export async function convert(companyId: string, leadId: string): Promise<ConvertResult | null> {
  return db.transaction(async (tx) => {
    // Claim the lead first: `converted_at IS NULL` in the WHERE means two
    // concurrent converts cannot both create a client.
    const [lead] = await tx
      .select()
      .from(leads)
      .where(and(eq(leads.id, leadId), liveLead(companyId), isNull(leads.convertedAt)))
      .limit(1);

    if (!lead) return null;

    const [client] = await tx
      .insert(clients)
      .values({
        companyId,
        // A lead with a company name becomes a company client; otherwise an individual.
        name: lead.companyName ?? lead.name,
        type: lead.companyName ? 'company' : 'individual',
        status: 'active',
        email: lead.email,
        phone: lead.phone,
        currency: lead.currency,
        ownerId: lead.ownerId,
      })
      .returning({ id: clients.id });

    if (!client) throw new Error('Client insert during conversion returned no row');

    await tx
      .update(leads)
      .set({ status: 'converted', convertedClientId: client.id, convertedAt: new Date() })
      .where(eq(leads.id, leadId));

    return { clientId: client.id };
  });
}

/** Active people who can own a lead. */
export async function listOwnerOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(eq(user.companyId, companyId), eq(user.isActive, true), isNull(user.deletedAt)))
    .orderBy(asc(user.name));
}

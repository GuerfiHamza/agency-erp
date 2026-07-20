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
import { clients, contacts, opportunities, projects, quoteItems, quotes } from '@/db/schema';
import { buildPaginatedResult, toOffset } from '@/lib/helpers';
import type { PaginatedResult, PaginationParams, SortDirection } from '@/types';

import type { QuoteInput, QuoteLineItemInput, QuoteSortField, QuoteStatus } from './quotes.validation';

export type { QuoteStatus };

/**
 * Quote data access. The only place in the module that touches Drizzle.
 *
 * Scoped by `companyId`, filters `deleted_at IS NULL`. Not `server-only`:
 * scripts and tests import it, and the ESLint boundary stops UI reaching `@/db`.
 */

export type QuoteRow = typeof quotes.$inferSelect;
export type QuoteItemRow = typeof quoteItems.$inferSelect;

export type QuoteListItem = QuoteRow & { clientName: string | null };
export type QuoteWithItems = QuoteRow & { clientName: string | null; items: QuoteItemRow[] };

/** Line items plus the derived totals the service computed for them. */
export type QuoteItemWrite = QuoteLineItemInput & { lineTotal: string; position: number };

export type QuoteTotals = {
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
};

export type QuoteHeaderWrite = Omit<QuoteInput, 'items'> &
  QuoteTotals & {
    sentAt: Date | null;
    acceptedAt: Date | null;
    rejectedAt: Date | null;
  };

export type QuoteCreateWrite = QuoteHeaderWrite & { number: string; createdById: string | null };
export type QuoteUpdateWrite = QuoteHeaderWrite;

const liveQuote = (companyId: string) =>
  and(eq(quotes.companyId, companyId), isNull(quotes.deletedAt)) as SQL;

const SORT_COLUMNS = {
  number: quotes.number,
  status: quotes.status,
  issueDate: quotes.issueDate,
  total: quotes.total,
  createdAt: quotes.createdAt,
} as const;

const SELECTION = { ...getTableColumns(quotes), clientName: clients.name };

export interface ListQuotesQuery extends PaginationParams {
  search?: string;
  sort?: { field: QuoteSortField; direction: SortDirection };
  statuses?: QuoteStatus[];
}

export async function listQuotes(
  companyId: string,
  query: ListQuotesQuery,
): Promise<PaginatedResult<QuoteListItem>> {
  const filters: SQL[] = [liveQuote(companyId)];

  if (query.search) {
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    filters.push(or(ilike(quotes.number, term), ilike(clients.name, term)) as SQL);
  }

  if (query.statuses && query.statuses.length > 0) {
    filters.push(inArray(quotes.status, query.statuses));
  }

  const where = and(...filters);

  const sortColumn = SORT_COLUMNS[query.sort?.field ?? 'createdAt'];
  const direction = query.sort?.direction === 'asc' ? asc : desc;

  const [items, [total]] = await Promise.all([
    db
      .select(SELECTION)
      .from(quotes)
      .leftJoin(clients, eq(clients.id, quotes.clientId))
      .where(where)
      .orderBy(direction(sortColumn), asc(quotes.id))
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db
      .select({ value: count() })
      .from(quotes)
      .leftJoin(clients, eq(clients.id, quotes.clientId))
      .where(where),
  ]);

  return buildPaginatedResult(items, total?.value ?? 0, query);
}

export async function findById(companyId: string, id: string): Promise<QuoteWithItems | null> {
  const [row] = await db
    .select(SELECTION)
    .from(quotes)
    .leftJoin(clients, eq(clients.id, quotes.clientId))
    .where(and(eq(quotes.id, id), liveQuote(companyId)))
    .limit(1);

  if (!row) return null;

  const items = await db
    .select()
    .from(quoteItems)
    .where(eq(quoteItems.quoteId, id))
    .orderBy(asc(quoteItems.position));

  return { ...row, items };
}

export async function clientBelongsToCompany(companyId: string, clientId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.companyId, companyId), isNull(clients.deletedAt)))
    .limit(1);

  return Boolean(row);
}

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

export async function opportunityBelongsToCompany(
  companyId: string,
  opportunityId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.id, opportunityId),
        eq(opportunities.companyId, companyId),
        isNull(opportunities.deletedAt),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export async function projectBelongsToCompany(companyId: string, projectId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.companyId, companyId), isNull(projects.deletedAt)))
    .limit(1);

  return Boolean(row);
}

/** Total quotes ever created for a company (including soft-deleted) — the number seed. */
export async function countAllQuotes(companyId: string): Promise<number> {
  const [row] = await db.select({ value: count() }).from(quotes).where(eq(quotes.companyId, companyId));
  return row?.value ?? 0;
}

/** Is a number already taken by a live quote? Matches the partial unique index. */
export async function isNumberTaken(companyId: string, number: string): Promise<boolean> {
  const [row] = await db
    .select({ id: quotes.id })
    .from(quotes)
    .where(and(eq(quotes.companyId, companyId), eq(quotes.number, number), isNull(quotes.deletedAt)))
    .limit(1);

  return Boolean(row);
}

async function insertItems(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  quoteId: string,
  items: QuoteItemWrite[],
): Promise<void> {
  if (items.length === 0) return;

  await tx.insert(quoteItems).values(items.map((item) => ({ ...item, quoteId })));
}

export async function create(
  companyId: string,
  values: QuoteCreateWrite,
  items: QuoteItemWrite[],
): Promise<QuoteRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(quotes)
      .values({ ...values, companyId })
      .returning();

    if (!row) throw new Error('Quote insert returned no row');

    await insertItems(tx, row.id, items);

    return row;
  });
}

export async function update(
  companyId: string,
  id: string,
  values: QuoteUpdateWrite,
  items: QuoteItemWrite[],
): Promise<QuoteRow | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(quotes)
      .set(values)
      .where(and(eq(quotes.id, id), liveQuote(companyId)))
      .returning();

    if (!row) return null;

    // Line items are fully replaced rather than diffed: the form posts the
    // whole array with no stable per-row id to reconcile against.
    await tx.delete(quoteItems).where(eq(quoteItems.quoteId, id));
    await insertItems(tx, id, items);

    return row;
  });
}

/** Status-only transition (e.g. "send") that never touches line items. */
export async function updateStatus(
  companyId: string,
  id: string,
  values: {
    status: QuoteStatus;
    sentAt: Date | null;
    acceptedAt: Date | null;
    rejectedAt: Date | null;
  },
): Promise<QuoteRow | null> {
  const [row] = await db
    .update(quotes)
    .set(values)
    .where(and(eq(quotes.id, id), liveQuote(companyId)))
    .returning();

  return row ?? null;
}

export async function softDelete(companyId: string, id: string): Promise<QuoteRow | null> {
  const [row] = await db
    .update(quotes)
    .set({ deletedAt: new Date() })
    .where(and(eq(quotes.id, id), liveQuote(companyId)))
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

export async function listOpportunityOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: opportunities.id, name: opportunities.name })
    .from(opportunities)
    .where(and(eq(opportunities.companyId, companyId), isNull(opportunities.deletedAt)))
    .orderBy(asc(opportunities.name));
}

export async function listProjectOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.companyId, companyId), isNull(projects.deletedAt)))
    .orderBy(asc(projects.name));
}

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
import { clients, contacts, proformaInvoiceItems, proformaInvoices, projects } from '@/db/schema';
import { buildPaginatedResult, toOffset } from '@/lib/helpers';
import type { PaginatedResult, PaginationParams, SortDirection } from '@/types';

import type {
  ProformaInput,
  ProformaLineItemInput,
  ProformaSortField,
  ProformaStatus,
} from './proforma-invoices.validation';

/**
 * Proforma invoice data access. The only place in the module that touches
 * Drizzle. Scoped by `companyId`, filters `deleted_at IS NULL`. Not
 * `server-only`: scripts and tests import it, and the ESLint boundary stops
 * UI reaching `@/db`.
 */

export type ProformaRow = typeof proformaInvoices.$inferSelect;
export type ProformaItemRow = typeof proformaInvoiceItems.$inferSelect;

export type ProformaListItem = ProformaRow & { clientName: string | null };
export type ProformaWithItems = ProformaRow & { clientName: string | null; items: ProformaItemRow[] };

export type ProformaItemWrite = ProformaLineItemInput & { lineTotal: string; position: number };

export type ProformaTotals = {
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
};

export type ProformaHeaderWrite = Omit<ProformaInput, 'items'> & ProformaTotals & { sentAt: Date | null };

export type ProformaCreateWrite = ProformaHeaderWrite & {
  number: string;
  createdById: string | null;
  quoteId: string | null;
};
export type ProformaUpdateWrite = ProformaHeaderWrite;

const liveProforma = (companyId: string) =>
  and(eq(proformaInvoices.companyId, companyId), isNull(proformaInvoices.deletedAt)) as SQL;

const SORT_COLUMNS = {
  number: proformaInvoices.number,
  status: proformaInvoices.status,
  issueDate: proformaInvoices.issueDate,
  total: proformaInvoices.total,
  createdAt: proformaInvoices.createdAt,
} as const;

const SELECTION = { ...getTableColumns(proformaInvoices), clientName: clients.name };

export interface ListProformasQuery extends PaginationParams {
  search?: string;
  sort?: { field: ProformaSortField; direction: SortDirection };
  statuses?: ProformaStatus[];
}

export async function listProformas(
  companyId: string,
  query: ListProformasQuery,
): Promise<PaginatedResult<ProformaListItem>> {
  const filters: SQL[] = [liveProforma(companyId)];

  if (query.search) {
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    filters.push(or(ilike(proformaInvoices.number, term), ilike(clients.name, term)) as SQL);
  }

  if (query.statuses && query.statuses.length > 0) {
    filters.push(inArray(proformaInvoices.status, query.statuses));
  }

  const where = and(...filters);

  const sortColumn = SORT_COLUMNS[query.sort?.field ?? 'createdAt'];
  const direction = query.sort?.direction === 'asc' ? asc : desc;

  const [items, [total]] = await Promise.all([
    db
      .select(SELECTION)
      .from(proformaInvoices)
      .leftJoin(clients, eq(clients.id, proformaInvoices.clientId))
      .where(where)
      .orderBy(direction(sortColumn), asc(proformaInvoices.id))
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db
      .select({ value: count() })
      .from(proformaInvoices)
      .leftJoin(clients, eq(clients.id, proformaInvoices.clientId))
      .where(where),
  ]);

  return buildPaginatedResult(items, total?.value ?? 0, query);
}

export async function findById(companyId: string, id: string): Promise<ProformaWithItems | null> {
  const [row] = await db
    .select(SELECTION)
    .from(proformaInvoices)
    .leftJoin(clients, eq(clients.id, proformaInvoices.clientId))
    .where(and(eq(proformaInvoices.id, id), liveProforma(companyId)))
    .limit(1);

  if (!row) return null;

  const items = await db
    .select()
    .from(proformaInvoiceItems)
    .where(eq(proformaInvoiceItems.proformaInvoiceId, id))
    .orderBy(asc(proformaInvoiceItems.position));

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

export async function projectBelongsToCompany(companyId: string, projectId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.companyId, companyId), isNull(projects.deletedAt)))
    .limit(1);

  return Boolean(row);
}

/** Total proformas ever created for a company (including soft-deleted) — the number seed. */
export async function countAllProformas(companyId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(proformaInvoices)
    .where(eq(proformaInvoices.companyId, companyId));
  return row?.value ?? 0;
}

/** Is a number already taken by a live proforma? Matches the partial unique index. */
export async function isNumberTaken(companyId: string, number: string): Promise<boolean> {
  const [row] = await db
    .select({ id: proformaInvoices.id })
    .from(proformaInvoices)
    .where(
      and(
        eq(proformaInvoices.companyId, companyId),
        eq(proformaInvoices.number, number),
        isNull(proformaInvoices.deletedAt),
      ),
    )
    .limit(1);

  return Boolean(row);
}

async function insertItems(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  proformaInvoiceId: string,
  items: ProformaItemWrite[],
): Promise<void> {
  if (items.length === 0) return;

  await tx.insert(proformaInvoiceItems).values(items.map((item) => ({ ...item, proformaInvoiceId })));
}

export async function create(
  companyId: string,
  values: ProformaCreateWrite,
  items: ProformaItemWrite[],
): Promise<ProformaRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(proformaInvoices)
      .values({ ...values, companyId })
      .returning();

    if (!row) throw new Error('Proforma invoice insert returned no row');

    await insertItems(tx, row.id, items);

    return row;
  });
}

export async function update(
  companyId: string,
  id: string,
  values: ProformaUpdateWrite,
  items: ProformaItemWrite[],
): Promise<ProformaRow | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(proformaInvoices)
      .set(values)
      .where(and(eq(proformaInvoices.id, id), liveProforma(companyId)))
      .returning();

    if (!row) return null;

    // Line items are fully replaced rather than diffed, same as Quotes: the
    // form posts the whole array with no stable per-row id to reconcile.
    await tx.delete(proformaInvoiceItems).where(eq(proformaInvoiceItems.proformaInvoiceId, id));
    await insertItems(tx, id, items);

    return row;
  });
}

/** Status-only transition (e.g. "send") that never touches line items. */
export async function updateStatus(
  companyId: string,
  id: string,
  values: { status: ProformaStatus; sentAt: Date | null },
): Promise<ProformaRow | null> {
  const [row] = await db
    .update(proformaInvoices)
    .set(values)
    .where(and(eq(proformaInvoices.id, id), liveProforma(companyId)))
    .returning();

  return row ?? null;
}

/**
 * Stamps the proforma as converted — called by the Invoices module once a
 * real invoice has been created from it. Never called from within this
 * module: nothing here can honestly claim an invoice exists.
 */
export async function markConverted(companyId: string, id: string): Promise<ProformaRow | null> {
  const [row] = await db
    .update(proformaInvoices)
    .set({ status: 'converted', convertedAt: new Date() })
    .where(and(eq(proformaInvoices.id, id), liveProforma(companyId)))
    .returning();

  return row ?? null;
}

export async function softDelete(companyId: string, id: string): Promise<ProformaRow | null> {
  const [row] = await db
    .update(proformaInvoices)
    .set({ deletedAt: new Date() })
    .where(and(eq(proformaInvoices.id, id), liveProforma(companyId)))
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

export async function listProjectOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.companyId, companyId), isNull(projects.deletedAt)))
    .orderBy(asc(projects.name));
}

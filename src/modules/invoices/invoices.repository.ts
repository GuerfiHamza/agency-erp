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
import { clients, contacts, invoiceItems, invoices, projects } from '@/db/schema';
import { buildPaginatedResult, toOffset } from '@/lib/helpers';
import type { PaginatedResult, PaginationParams, SortDirection } from '@/types';

import type {
  InvoiceInput,
  InvoiceLineItemInput,
  InvoiceSortField,
  InvoiceStatus,
} from './invoices.validation';

/**
 * Invoice data access. The only place in the module that touches Drizzle.
 *
 * Scoped by `companyId`, filters `deleted_at IS NULL`. Not `server-only`:
 * scripts and tests import it, and the ESLint boundary stops UI reaching `@/db`.
 */

export type InvoiceRow = typeof invoices.$inferSelect;
export type InvoiceItemRow = typeof invoiceItems.$inferSelect;

export type InvoiceListItem = InvoiceRow & { clientName: string | null };
export type InvoiceWithItems = InvoiceRow & { clientName: string | null; items: InvoiceItemRow[] };

export type InvoiceItemWrite = InvoiceLineItemInput & { lineTotal: string; position: number };

export type InvoiceTotals = {
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
};

/** Header fields a draft edit may change. Never `amountPaid` — the payment service owns that column. */
export type InvoiceHeaderWrite = Omit<InvoiceInput, 'items'> & InvoiceTotals;

export type InvoiceCreateWrite = InvoiceHeaderWrite & {
  number: string;
  createdById: string | null;
  quoteId: string | null;
  proformaInvoiceId: string | null;
};
export type InvoiceUpdateWrite = InvoiceHeaderWrite;

const liveInvoice = (companyId: string) =>
  and(eq(invoices.companyId, companyId), isNull(invoices.deletedAt)) as SQL;

const SORT_COLUMNS = {
  number: invoices.number,
  status: invoices.status,
  issueDate: invoices.issueDate,
  dueDate: invoices.dueDate,
  total: invoices.total,
  createdAt: invoices.createdAt,
} as const;

const SELECTION = { ...getTableColumns(invoices), clientName: clients.name };

export interface ListInvoicesQuery extends PaginationParams {
  search?: string;
  sort?: { field: InvoiceSortField; direction: SortDirection };
  statuses?: InvoiceStatus[];
}

export async function listInvoices(
  companyId: string,
  query: ListInvoicesQuery,
): Promise<PaginatedResult<InvoiceListItem>> {
  const filters: SQL[] = [liveInvoice(companyId)];

  if (query.search) {
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    filters.push(or(ilike(invoices.number, term), ilike(clients.name, term)) as SQL);
  }

  if (query.statuses && query.statuses.length > 0) {
    filters.push(inArray(invoices.status, query.statuses));
  }

  const where = and(...filters);

  const sortColumn = SORT_COLUMNS[query.sort?.field ?? 'createdAt'];
  const direction = query.sort?.direction === 'asc' ? asc : desc;

  const [items, [total]] = await Promise.all([
    db
      .select(SELECTION)
      .from(invoices)
      .leftJoin(clients, eq(clients.id, invoices.clientId))
      .where(where)
      .orderBy(direction(sortColumn), asc(invoices.id))
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db
      .select({ value: count() })
      .from(invoices)
      .leftJoin(clients, eq(clients.id, invoices.clientId))
      .where(where),
  ]);

  return buildPaginatedResult(items, total?.value ?? 0, query);
}

export async function findById(companyId: string, id: string): Promise<InvoiceWithItems | null> {
  const [row] = await db
    .select(SELECTION)
    .from(invoices)
    .leftJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(eq(invoices.id, id), liveInvoice(companyId)))
    .limit(1);

  if (!row) return null;

  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, id))
    .orderBy(asc(invoiceItems.position));

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

/** Total invoices ever created for a company (including soft-deleted) — the number seed. */
export async function countAllInvoices(companyId: string): Promise<number> {
  const [row] = await db.select({ value: count() }).from(invoices).where(eq(invoices.companyId, companyId));
  return row?.value ?? 0;
}

/** Is a number already taken by a live invoice? Matches the partial unique index. */
export async function isNumberTaken(companyId: string, number: string): Promise<boolean> {
  const [row] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.companyId, companyId), eq(invoices.number, number), isNull(invoices.deletedAt)))
    .limit(1);

  return Boolean(row);
}

async function insertItems(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  invoiceId: string,
  items: InvoiceItemWrite[],
): Promise<void> {
  if (items.length === 0) return;

  await tx.insert(invoiceItems).values(items.map((item) => ({ ...item, invoiceId })));
}

export async function create(
  companyId: string,
  values: InvoiceCreateWrite,
  items: InvoiceItemWrite[],
): Promise<InvoiceRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(invoices)
      .values({ ...values, companyId })
      .returning();

    if (!row) throw new Error('Invoice insert returned no row');

    await insertItems(tx, row.id, items);

    return row;
  });
}

/** A draft-only edit. The caller (service) has already refused anything past `draft`. */
export async function update(
  companyId: string,
  id: string,
  values: InvoiceUpdateWrite,
  items: InvoiceItemWrite[],
): Promise<InvoiceRow | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(invoices)
      .set(values)
      .where(and(eq(invoices.id, id), liveInvoice(companyId)))
      .returning();

    if (!row) return null;

    await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    await insertItems(tx, id, items);

    return row;
  });
}

/** Status-only transitions (send, void, cancel) that never touch line items or `amountPaid`. */
export async function updateStatus(
  companyId: string,
  id: string,
  values: { status: InvoiceStatus; sentAt?: Date | null; voidedAt?: Date | null },
): Promise<InvoiceRow | null> {
  const [row] = await db
    .update(invoices)
    .set(values)
    .where(and(eq(invoices.id, id), liveInvoice(companyId)))
    .returning();

  return row ?? null;
}

export async function softDelete(companyId: string, id: string): Promise<InvoiceRow | null> {
  const [row] = await db
    .update(invoices)
    .set({ deletedAt: new Date() })
    .where(and(eq(invoices.id, id), liveInvoice(companyId)))
    .returning();

  return row ?? null;
}

/** `paymentTermsDays` rides along so the form can prefill a due date without a second fetch. */
export async function listClientOptions(
  companyId: string,
): Promise<{ id: string; name: string; paymentTermsDays: number | null }[]> {
  return db
    .select({ id: clients.id, name: clients.name, paymentTermsDays: clients.paymentTermsDays })
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

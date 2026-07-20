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
import { clients, invoices, payments, purchaseOrders, suppliers } from '@/db/schema';
import { buildPaginatedResult, toOffset } from '@/lib/helpers';
import type { PaginatedResult, PaginationParams, SortDirection } from '@/types';

import type {
  PaymentDirection,
  PaymentInput,
  PaymentStatus,
  PaymentUpdateInput,
} from './payments.validation';

/**
 * Payment data access. The only place in the module that touches Drizzle.
 *
 * Every query is scoped by `companyId` and filters `deleted_at IS NULL`. Not
 * marked `server-only`: scripts and tests import it, and the ESLint boundary
 * already stops UI reaching `@/db`.
 *
 * `invoiceNumber`/`purchaseOrderNumber`/`clientName`/`supplierName` ride
 * along unmerged rather than a `coalesce()` in raw SQL — a payment's own
 * `direction` already says which pair is live, and `${column}` inside a
 * `sql` template renders as a BARE, unqualified name (see MEMORY.md); with
 * `invoices.number` and `purchase_orders.number` both in scope from the same
 * two LEFT JOINs, a `coalesce(${invoices.number}, ${purchaseOrders.number})`
 * would be ambiguous at best. Picking the right one in JS, keyed off
 * `direction`, sidesteps the trap entirely.
 */

export type PaymentRow = typeof payments.$inferSelect;

export type PaymentListItem = PaymentRow & {
  invoiceNumber: string | null;
  purchaseOrderNumber: string | null;
  clientName: string | null;
  supplierName: string | null;
};

const livePayment = (companyId: string) =>
  and(eq(payments.companyId, companyId), isNull(payments.deletedAt)) as SQL;

const SORT_COLUMNS = {
  paidAt: payments.paidAt,
  amount: payments.amount,
  status: payments.status,
  createdAt: payments.createdAt,
} as const;

const SELECTION = {
  ...getTableColumns(payments),
  invoiceNumber: invoices.number,
  purchaseOrderNumber: purchaseOrders.number,
  clientName: clients.name,
  supplierName: suppliers.name,
};

export interface ListPaymentsQuery extends PaginationParams {
  search?: string;
  sort?: { field: keyof typeof SORT_COLUMNS; direction: SortDirection };
  statuses?: PaymentStatus[];
  directions?: PaymentDirection[];
}

function buildFilters(
  companyId: string,
  query: Pick<ListPaymentsQuery, 'search' | 'statuses' | 'directions'>,
): SQL {
  const filters: SQL[] = [livePayment(companyId)];

  if (query.search) {
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    filters.push(
      or(
        ilike(payments.reference, term),
        ilike(invoices.number, term),
        ilike(purchaseOrders.number, term),
        ilike(clients.name, term),
        ilike(suppliers.name, term),
      ) as SQL,
    );
  }

  if (query.statuses && query.statuses.length > 0) {
    filters.push(inArray(payments.status, query.statuses));
  }

  if (query.directions && query.directions.length > 0) {
    filters.push(inArray(payments.direction, query.directions));
  }

  return and(...filters) as SQL;
}

export async function listPayments(
  companyId: string,
  query: ListPaymentsQuery,
): Promise<PaginatedResult<PaymentListItem>> {
  const where = buildFilters(companyId, query);

  const sortColumn = SORT_COLUMNS[query.sort?.field ?? 'paidAt'];
  const direction = query.sort?.direction === 'asc' ? asc : desc;

  const [items, [total]] = await Promise.all([
    db
      .select(SELECTION)
      .from(payments)
      .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
      .leftJoin(purchaseOrders, eq(purchaseOrders.id, payments.purchaseOrderId))
      .leftJoin(clients, eq(clients.id, payments.clientId))
      .leftJoin(suppliers, eq(suppliers.id, payments.supplierId))
      .where(where)
      .orderBy(direction(sortColumn), asc(payments.id))
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db
      .select({ value: count() })
      .from(payments)
      .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
      .leftJoin(purchaseOrders, eq(purchaseOrders.id, payments.purchaseOrderId))
      .leftJoin(clients, eq(clients.id, payments.clientId))
      .leftJoin(suppliers, eq(suppliers.id, payments.supplierId))
      .where(where),
  ]);

  return buildPaginatedResult(items, total?.value ?? 0, query);
}

export async function findById(companyId: string, id: string): Promise<PaymentListItem | null> {
  const [row] = await db
    .select(SELECTION)
    .from(payments)
    .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
    .leftJoin(purchaseOrders, eq(purchaseOrders.id, payments.purchaseOrderId))
    .leftJoin(clients, eq(clients.id, payments.clientId))
    .leftJoin(suppliers, eq(suppliers.id, payments.supplierId))
    .where(and(eq(payments.id, id), livePayment(companyId)))
    .limit(1);

  return row ?? null;
}

export type PaymentCreateWrite = Omit<PaymentInput, 'documentId'> & {
  invoiceId: string | null;
  purchaseOrderId: string | null;
  clientId: string | null;
  supplierId: string | null;
  currency: string;
  recordedById: string | null;
};

/**
 * Inserts the payment, and — only when it lands as `completed` inbound —
 * applies it to the invoice in the same transaction. `applyDelta` is the
 * signed amount to add to `amountPaid`, or `null` when nothing should apply
 * yet (a `pending` payment, or any outbound payment — POs have no
 * `amountPaid`-equivalent column to maintain).
 */
export async function create(
  companyId: string,
  values: PaymentCreateWrite,
  applyDelta: string | null,
): Promise<PaymentRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(payments)
      .values({ ...values, companyId })
      .returning();

    if (!row) throw new Error('Payment insert returned no row');

    if (applyDelta && row.invoiceId) {
      await applyToInvoice(tx, row.invoiceId, applyDelta);
    }

    return row;
  });
}

export async function update(
  companyId: string,
  id: string,
  values: PaymentUpdateInput,
): Promise<PaymentRow | null> {
  const [row] = await db
    .update(payments)
    .set(values)
    .where(and(eq(payments.id, id), livePayment(companyId)))
    .returning();

  return row ?? null;
}

/**
 * Flips `status` and — only for an inbound payment — applies `applyDelta` to
 * the settled invoice's `amountPaid` in the same transaction. Used by
 * `markCompleted` (delta positive), `refund` (delta negative), and
 * `markFailed` (`applyDelta` null — a pending payment never touched
 * `amountPaid`, so failing it has nothing to reverse).
 */
export async function updateStatus(
  companyId: string,
  id: string,
  status: PaymentStatus,
  applyDelta: string | null,
): Promise<PaymentRow | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(payments)
      .set({ status })
      .where(and(eq(payments.id, id), livePayment(companyId)))
      .returning();

    if (!row) return null;

    if (applyDelta && row.invoiceId) {
      await applyToInvoice(tx, row.invoiceId, applyDelta);
    }

    return row;
  });
}

export async function softDelete(companyId: string, id: string): Promise<PaymentRow | null> {
  const [row] = await db
    .update(payments)
    .set({ deletedAt: new Date() })
    .where(and(eq(payments.id, id), livePayment(companyId)))
    .returning();

  return row ?? null;
}

/**
 * The single writer to `invoices.amountPaid` (see MEMORY.md). A signed SQL
 * increment rather than read-then-write, so two payments landing at once
 * cannot clobber each other. Re-derives `status` from the *result* of the
 * increment, not the pre-update row, in a second statement in the same
 * transaction.
 */
async function applyToInvoice(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  invoiceId: string,
  delta: string,
): Promise<void> {
  const [updated] = await tx
    .update(invoices)
    .set({ amountPaid: sql`${invoices.amountPaid} + ${delta}` })
    .where(eq(invoices.id, invoiceId))
    .returning({ amountPaid: invoices.amountPaid, total: invoices.total, status: invoices.status });

  if (!updated) throw new Error('Invoice not found while applying a payment');

  const nextStatus =
    Number(updated.amountPaid) >= Number(updated.total)
      ? 'paid'
      : Number(updated.amountPaid) > 0
        ? 'partially_paid'
        : 'sent';

  if (nextStatus !== updated.status) {
    await tx.update(invoices).set({ status: nextStatus }).where(eq(invoices.id, invoiceId));
  }
}

export interface PayableInvoiceOption {
  id: string;
  number: string;
  clientId: string;
  clientName: string | null;
  currency: string;
  total: string;
  amountPaid: string;
}

/** Invoices with an outstanding balance — the only ones a new inbound payment can settle. */
export async function listPayableInvoices(companyId: string): Promise<PayableInvoiceOption[]> {
  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      clientId: invoices.clientId,
      clientName: clients.name,
      currency: invoices.currency,
      total: invoices.total,
      amountPaid: invoices.amountPaid,
    })
    .from(invoices)
    .leftJoin(clients, eq(clients.id, invoices.clientId))
    .where(
      and(
        eq(invoices.companyId, companyId),
        isNull(invoices.deletedAt),
        inArray(invoices.status, ['sent', 'partially_paid', 'overdue']),
      ),
    )
    .orderBy(asc(invoices.number));
}

export interface PayablePurchaseOrderOption {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string | null;
  currency: string;
  total: string;
}

/** Purchase orders that have actually gone to a supplier — the only ones a new outbound payment can settle. */
export async function listPayablePurchaseOrders(companyId: string): Promise<PayablePurchaseOrderOption[]> {
  return db
    .select({
      id: purchaseOrders.id,
      number: purchaseOrders.number,
      supplierId: purchaseOrders.supplierId,
      supplierName: suppliers.name,
      currency: purchaseOrders.currency,
      total: purchaseOrders.total,
    })
    .from(purchaseOrders)
    .leftJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .where(
      and(
        eq(purchaseOrders.companyId, companyId),
        isNull(purchaseOrders.deletedAt),
        inArray(purchaseOrders.status, ['sent', 'confirmed', 'partially_received', 'received']),
      ),
    )
    .orderBy(asc(purchaseOrders.number));
}

/** Cap on export size — a link that streams an unbounded table is a way to fall over. */
const EXPORT_LIMIT = 5000;

export interface PaymentExportRow {
  direction: PaymentDirection;
  status: PaymentStatus;
  method: string;
  amount: string;
  currency: string;
  paidAt: Date;
  documentNumber: string | null;
  counterpartyName: string | null;
  reference: string | null;
  createdAt: Date;
}

export async function exportRows(
  companyId: string,
  query: Pick<ListPaymentsQuery, 'search' | 'statuses' | 'directions' | 'sort'>,
): Promise<PaymentExportRow[]> {
  const where = buildFilters(companyId, query);
  const sortColumn = SORT_COLUMNS[query.sort?.field ?? 'paidAt'];
  const direction = query.sort?.direction === 'asc' ? asc : desc;

  const rows = await db
    .select(SELECTION)
    .from(payments)
    .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
    .leftJoin(purchaseOrders, eq(purchaseOrders.id, payments.purchaseOrderId))
    .leftJoin(clients, eq(clients.id, payments.clientId))
    .leftJoin(suppliers, eq(suppliers.id, payments.supplierId))
    .where(where)
    .orderBy(direction(sortColumn), asc(payments.id))
    .limit(EXPORT_LIMIT);

  return rows.map((row) => ({
    direction: row.direction,
    status: row.status,
    method: row.method,
    amount: row.amount,
    currency: row.currency,
    paidAt: row.paidAt,
    documentNumber: row.direction === 'inbound' ? row.invoiceNumber : row.purchaseOrderNumber,
    counterpartyName: row.direction === 'inbound' ? row.clientName : row.supplierName,
    reference: row.reference,
    createdAt: row.createdAt,
  }));
}

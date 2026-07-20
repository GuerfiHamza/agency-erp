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
import { projects, purchaseOrderItems, purchaseOrders, suppliers } from '@/db/schema';
import { buildPaginatedResult, toOffset } from '@/lib/helpers';
import type { PaginatedResult, PaginationParams, SortDirection } from '@/types';

import type {
  PurchaseOrderInput,
  PurchaseOrderLineItemInput,
  PurchaseOrderSortField,
  PurchaseOrderStatus,
} from './purchase-orders.validation';

/**
 * Purchase order data access. The only place in the module that touches
 * Drizzle. Scoped by `companyId`, filters `deleted_at IS NULL`. Not
 * `server-only`: scripts and tests import it, and the ESLint boundary stops
 * UI reaching `@/db`.
 *
 * There is no `suppliers` module yet (Suppliers ships after Purchase
 * Orders), so this file queries `suppliers` directly for tenant guards, the
 * option list, and PDF detail — the same posture Quotes/Invoices had toward
 * `clients` before that module existed.
 */

export type PurchaseOrderRow = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderItemRow = typeof purchaseOrderItems.$inferSelect;

export type PurchaseOrderListItem = PurchaseOrderRow & { supplierName: string | null };
export type PurchaseOrderWithItems = PurchaseOrderRow & {
  supplierName: string | null;
  items: PurchaseOrderItemRow[];
};

export type PurchaseOrderItemWrite = PurchaseOrderLineItemInput & { lineTotal: string; position: number };

export type PurchaseOrderTotals = {
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
};

export type PurchaseOrderHeaderWrite = Omit<PurchaseOrderInput, 'items'> & PurchaseOrderTotals;

export type PurchaseOrderCreateWrite = PurchaseOrderHeaderWrite & {
  number: string;
  createdById: string | null;
};
export type PurchaseOrderUpdateWrite = PurchaseOrderHeaderWrite;

const livePurchaseOrder = (companyId: string) =>
  and(eq(purchaseOrders.companyId, companyId), isNull(purchaseOrders.deletedAt)) as SQL;

const SORT_COLUMNS = {
  number: purchaseOrders.number,
  status: purchaseOrders.status,
  issueDate: purchaseOrders.issueDate,
  expectedDate: purchaseOrders.expectedDate,
  total: purchaseOrders.total,
  createdAt: purchaseOrders.createdAt,
} as const;

const SELECTION = { ...getTableColumns(purchaseOrders), supplierName: suppliers.name };

export interface ListPurchaseOrdersQuery extends PaginationParams {
  search?: string;
  sort?: { field: PurchaseOrderSortField; direction: SortDirection };
  statuses?: PurchaseOrderStatus[];
}

export async function listPurchaseOrders(
  companyId: string,
  query: ListPurchaseOrdersQuery,
): Promise<PaginatedResult<PurchaseOrderListItem>> {
  const filters: SQL[] = [livePurchaseOrder(companyId)];

  if (query.search) {
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    filters.push(or(ilike(purchaseOrders.number, term), ilike(suppliers.name, term)) as SQL);
  }

  if (query.statuses && query.statuses.length > 0) {
    filters.push(inArray(purchaseOrders.status, query.statuses));
  }

  const where = and(...filters);

  const sortColumn = SORT_COLUMNS[query.sort?.field ?? 'createdAt'];
  const direction = query.sort?.direction === 'asc' ? asc : desc;

  const [items, [total]] = await Promise.all([
    db
      .select(SELECTION)
      .from(purchaseOrders)
      .leftJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .where(where)
      .orderBy(direction(sortColumn), asc(purchaseOrders.id))
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db
      .select({ value: count() })
      .from(purchaseOrders)
      .leftJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .where(where),
  ]);

  return buildPaginatedResult(items, total?.value ?? 0, query);
}

export async function findById(companyId: string, id: string): Promise<PurchaseOrderWithItems | null> {
  const [row] = await db
    .select(SELECTION)
    .from(purchaseOrders)
    .leftJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .where(and(eq(purchaseOrders.id, id), livePurchaseOrder(companyId)))
    .limit(1);

  if (!row) return null;

  const items = await db
    .select()
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, id))
    .orderBy(asc(purchaseOrderItems.position));

  return { ...row, items };
}

export async function supplierBelongsToCompany(companyId: string, supplierId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.companyId, companyId), isNull(suppliers.deletedAt)))
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

/** Total purchase orders ever created for a company (including soft-deleted) — the number seed. */
export async function countAllPurchaseOrders(companyId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.companyId, companyId));
  return row?.value ?? 0;
}

/** Is a number already taken by a live purchase order? Matches the partial unique index. */
export async function isNumberTaken(companyId: string, number: string): Promise<boolean> {
  const [row] = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.companyId, companyId),
        eq(purchaseOrders.number, number),
        isNull(purchaseOrders.deletedAt),
      ),
    )
    .limit(1);

  return Boolean(row);
}

async function insertItems(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  purchaseOrderId: string,
  items: PurchaseOrderItemWrite[],
): Promise<void> {
  if (items.length === 0) return;

  await tx.insert(purchaseOrderItems).values(items.map((item) => ({ ...item, purchaseOrderId })));
}

export async function create(
  companyId: string,
  values: PurchaseOrderCreateWrite,
  items: PurchaseOrderItemWrite[],
): Promise<PurchaseOrderRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(purchaseOrders)
      .values({ ...values, companyId })
      .returning();

    if (!row) throw new Error('Purchase order insert returned no row');

    await insertItems(tx, row.id, items);

    return row;
  });
}

/** A draft-only edit. The caller (service) has already refused anything past `draft`. */
export async function update(
  companyId: string,
  id: string,
  values: PurchaseOrderUpdateWrite,
  items: PurchaseOrderItemWrite[],
): Promise<PurchaseOrderRow | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(purchaseOrders)
      .set(values)
      .where(and(eq(purchaseOrders.id, id), livePurchaseOrder(companyId)))
      .returning();

    if (!row) return null;

    await tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id));
    await insertItems(tx, id, items);

    return row;
  });
}

/** Status-only transitions (send, approve, confirm, cancel) that never touch line items. */
export async function updateStatus(
  companyId: string,
  id: string,
  values: {
    status?: PurchaseOrderStatus;
    sentAt?: Date | null;
    approvedById?: string | null;
    approvedAt?: Date | null;
  },
): Promise<PurchaseOrderRow | null> {
  const [row] = await db
    .update(purchaseOrders)
    .set(values)
    .where(and(eq(purchaseOrders.id, id), livePurchaseOrder(companyId)))
    .returning();

  return row ?? null;
}

/**
 * Adds `quantityReceived` deliveries onto each named line (never a
 * replacement — two separate deliveries on the same day must both count),
 * then stamps the header status/`receivedAt` the service already computed
 * from the post-receipt totals.
 */
export async function receiveItems(
  companyId: string,
  id: string,
  receipts: { itemId: string; quantityReceived: string }[],
  header: { status: PurchaseOrderStatus; receivedAt: Date | null },
): Promise<PurchaseOrderWithItems | null> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, id), livePurchaseOrder(companyId)))
      .limit(1);

    if (!existing) return null;

    for (const receipt of receipts) {
      await tx
        .update(purchaseOrderItems)
        .set({ quantityReceived: sql`${purchaseOrderItems.quantityReceived} + ${receipt.quantityReceived}` })
        .where(and(eq(purchaseOrderItems.id, receipt.itemId), eq(purchaseOrderItems.purchaseOrderId, id)));
    }

    const [row] = await tx.update(purchaseOrders).set(header).where(eq(purchaseOrders.id, id)).returning();

    if (!row) return null;

    const items = await tx
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, id))
      .orderBy(asc(purchaseOrderItems.position));

    const [supplierRow] = await tx
      .select({ name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.id, row.supplierId))
      .limit(1);

    return { ...row, supplierName: supplierRow?.name ?? null, items };
  });
}

export async function softDelete(companyId: string, id: string): Promise<PurchaseOrderRow | null> {
  const [row] = await db
    .update(purchaseOrders)
    .set({ deletedAt: new Date() })
    .where(and(eq(purchaseOrders.id, id), livePurchaseOrder(companyId)))
    .returning();

  return row ?? null;
}

export async function listSupplierOptions(
  companyId: string,
): Promise<{ id: string; name: string; paymentTermsDays: number | null }[]> {
  return db
    .select({ id: suppliers.id, name: suppliers.name, paymentTermsDays: suppliers.paymentTermsDays })
    .from(suppliers)
    .where(and(eq(suppliers.companyId, companyId), isNull(suppliers.deletedAt)))
    .orderBy(asc(suppliers.name));
}

export async function listProjectOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.companyId, companyId), isNull(projects.deletedAt)))
    .orderBy(asc(projects.name));
}

export type SupplierDetail = typeof suppliers.$inferSelect;

/** Full supplier row for the PDF route — no `suppliers` service yet to borrow this from. */
export async function getSupplierDetail(
  companyId: string,
  supplierId: string,
): Promise<SupplierDetail | null> {
  const [row] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.companyId, companyId), isNull(suppliers.deletedAt)))
    .limit(1);

  return row ?? null;
}

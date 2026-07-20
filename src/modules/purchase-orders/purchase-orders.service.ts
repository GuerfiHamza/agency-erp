import 'server-only';

import Decimal from 'decimal.js';

import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { computeDocumentTotals, computeLineTotals } from '@/lib/money';

import * as repository from './purchase-orders.repository';
import type { PurchaseOrderInput, PurchaseOrderLineItemInput } from './purchase-orders.validation';

/**
 * Purchase order rules. Same shape as Invoices (number generation, draft-only
 * edit lock, delete restricted to draft/cancelled) with one structural
 * difference: the status enum has no `void`, because a purchase order was
 * never shown to a client — `cancelled` is the only reversal, reachable from
 * anything short of `received`.
 *
 * `approvedById`/`approvedAt` is a spend-authorization stamp, orthogonal to
 * the status column (there is no "approved" status) — it is not gated on or
 * by `sent`, deliberately: nothing in this schema says authorization must
 * precede sending, and inventing that rule would be a guess.
 */

export type {
  PurchaseOrderListItem,
  PurchaseOrderWithItems,
  ListPurchaseOrdersQuery,
} from './purchase-orders.repository';

async function assertSupplierInCompany(companyId: string, supplierId: string): Promise<void> {
  if (!(await repository.supplierBelongsToCompany(companyId, supplierId))) {
    throw new ValidationError('That supplier does not exist in this workspace.');
  }
}

async function assertProjectInCompany(companyId: string, projectId: string | null): Promise<void> {
  if (!projectId) return;
  if (!(await repository.projectBelongsToCompany(companyId, projectId))) {
    throw new ValidationError('That project does not exist in this workspace.');
  }
}

async function assertLinks(companyId: string, input: PurchaseOrderInput): Promise<void> {
  await assertSupplierInCompany(companyId, input.supplierId);
  await assertProjectInCompany(companyId, input.projectId);
}

/**
 * Next free purchase order number, `PO-{year}-{seq}` — the Invoices/Quotes
 * seed-then-walk pattern verbatim; the partial unique index is the real
 * guarantee.
 */
async function generateNumber(companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  let seq = (await repository.countAllPurchaseOrders(companyId)) + 1;

  for (let attempt = 0; attempt < 1000; attempt++) {
    const number = `PO-${year}-${String(seq).padStart(4, '0')}`;
    if (!(await repository.isNumberTaken(companyId, number))) return number;
    seq++;
  }

  throw new Error('Could not allocate a purchase order number');
}

function toItemsWrite(items: PurchaseOrderLineItemInput[]): repository.PurchaseOrderItemWrite[] {
  return items.map((item, index) => ({
    ...item,
    lineTotal: computeLineTotals(item).lineTotal,
    position: index,
  }));
}

export async function listPurchaseOrders(companyId: string, query: repository.ListPurchaseOrdersQuery) {
  return repository.listPurchaseOrders(companyId, query);
}

export async function getPurchaseOrder(companyId: string, id: string) {
  const found = await repository.findById(companyId, id);

  if (!found) throw new NotFoundError('Purchase order not found.');

  return found;
}

export async function listSupplierOptions(companyId: string) {
  return repository.listSupplierOptions(companyId);
}

export async function listProjectOptions(companyId: string) {
  return repository.listProjectOptions(companyId);
}

/** Full supplier detail for the PDF route — there is no `suppliers` service yet to call instead. */
export async function getSupplierDetail(companyId: string, supplierId: string) {
  const found = await repository.getSupplierDetail(companyId, supplierId);

  if (!found) throw new NotFoundError('Supplier not found.');

  return found;
}

export async function createPurchaseOrder(companyId: string, actorUserId: string, input: PurchaseOrderInput) {
  await assertLinks(companyId, input);

  const { items, ...header } = input;
  const number = await generateNumber(companyId);
  const totals = computeDocumentTotals(items);

  const created = await repository.create(
    companyId,
    { ...header, ...totals, number, createdById: actorUserId },
    toItemsWrite(items),
  );

  logger.info('Purchase order created', { companyId, purchaseOrderId: created.id, number });

  return created;
}

/** A draft-only edit — mirrors Invoices' content lock, one status earlier: nothing has gone to the supplier yet. */
export async function updatePurchaseOrder(companyId: string, id: string, input: PurchaseOrderInput) {
  const existing = await getPurchaseOrder(companyId, id);

  if (existing.status !== 'draft') {
    throw new ConflictError('Only a draft purchase order can be edited.');
  }

  await assertLinks(companyId, input);

  const { items, ...header } = input;
  const totals = computeDocumentTotals(items);

  const updated = await repository.update(companyId, id, { ...header, ...totals }, toItemsWrite(items));

  if (!updated) throw new NotFoundError('Purchase order not found.');

  logger.info('Purchase order updated', { companyId, purchaseOrderId: id });

  return updated;
}

/** The one-click "send to supplier" action — only a draft can be sent. */
export async function sendPurchaseOrder(companyId: string, id: string) {
  const existing = await getPurchaseOrder(companyId, id);

  if (existing.status !== 'draft') {
    throw new ConflictError('Only a draft purchase order can be sent.');
  }

  const updated = await repository.updateStatus(companyId, id, { status: 'sent', sentAt: new Date() });

  if (!updated) throw new NotFoundError('Purchase order not found.');

  logger.info('Purchase order sent', { companyId, purchaseOrderId: id });

  return updated;
}

/** Internal spend authorization. Refused once cancelled, and refused twice — idempotent by intent, not accident. */
export async function approvePurchaseOrder(companyId: string, actorUserId: string, id: string) {
  const existing = await getPurchaseOrder(companyId, id);

  if (existing.status === 'cancelled') {
    throw new ConflictError('A cancelled purchase order cannot be approved.');
  }

  if (existing.approvedAt) {
    throw new ConflictError('This purchase order is already approved.');
  }

  const updated = await repository.updateStatus(companyId, id, {
    approvedById: actorUserId,
    approvedAt: new Date(),
  });

  if (!updated) throw new NotFoundError('Purchase order not found.');

  logger.info('Purchase order approved', { companyId, purchaseOrderId: id, approvedById: actorUserId });

  return updated;
}

/** The supplier acknowledged the order. Only meaningful once it has actually been sent. */
export async function confirmPurchaseOrder(companyId: string, id: string) {
  const existing = await getPurchaseOrder(companyId, id);

  if (existing.status !== 'sent') {
    throw new ConflictError('Only a sent purchase order can be confirmed.');
  }

  const updated = await repository.updateStatus(companyId, id, { status: 'confirmed' });

  if (!updated) throw new NotFoundError('Purchase order not found.');

  logger.info('Purchase order confirmed', { companyId, purchaseOrderId: id });

  return updated;
}

/**
 * Records a delivery. Each line's `quantityReceived` in the payload is
 * *added* to what is already on the row — a second, later delivery must not
 * erase the first. The resulting status is derived, never chosen: `received`
 * once every line is fully received, `partially_received` while any line is
 * short, and `receivedAt` only stamps on the former.
 */
export async function receivePurchaseOrder(
  companyId: string,
  id: string,
  lines: { itemId: string; quantityReceived: string }[],
) {
  const existing = await getPurchaseOrder(companyId, id);

  if (!['sent', 'confirmed', 'partially_received'].includes(existing.status)) {
    throw new ConflictError(
      'Only a sent, confirmed, or partially received purchase order can receive stock.',
    );
  }

  const itemsById = new Map(existing.items.map((item) => [item.id, item]));
  const projected = new Map(existing.items.map((item) => [item.id, new Decimal(item.quantityReceived)]));

  for (const line of lines) {
    const item = itemsById.get(line.itemId);
    if (!item) throw new ValidationError('That line item is not on this purchase order.');

    const delta = new Decimal(line.quantityReceived);
    const next = (projected.get(line.itemId) ?? new Decimal(0)).plus(delta);

    if (next.greaterThan(item.quantity)) {
      throw new ValidationError(`Cannot receive more than ordered for "${item.description}".`);
    }

    projected.set(line.itemId, next);
  }

  const isFullyReceived = existing.items.every((item) =>
    (projected.get(item.id) ?? new Decimal(0)).greaterThanOrEqualTo(item.quantity),
  );
  const hasAnyReceived = existing.items.some((item) =>
    (projected.get(item.id) ?? new Decimal(0)).greaterThan(0),
  );

  const status = isFullyReceived ? 'received' : hasAnyReceived ? 'partially_received' : existing.status;

  const updated = await repository.receiveItems(companyId, id, lines, {
    status,
    receivedAt: isFullyReceived ? new Date() : null,
  });

  if (!updated) throw new NotFoundError('Purchase order not found.');

  logger.info('Purchase order stock received', { companyId, purchaseOrderId: id, status });

  return updated;
}

/** Abandons a purchase order without deleting it — kept for reference, its number never recycled. */
export async function cancelPurchaseOrder(companyId: string, id: string) {
  const existing = await getPurchaseOrder(companyId, id);

  if (existing.status === 'received' || existing.status === 'cancelled') {
    throw new ConflictError('A received or already-cancelled purchase order cannot be cancelled.');
  }

  const updated = await repository.updateStatus(companyId, id, { status: 'cancelled' });

  if (!updated) throw new NotFoundError('Purchase order not found.');

  logger.info('Purchase order cancelled', { companyId, purchaseOrderId: id });

  return updated;
}

/**
 * Deletion is refused for anything that ever left `draft` (cancelled is the
 * one exception, same as Invoices) — the rule that keeps an issued number
 * from ever being recycled (see `generateNumber`).
 */
export async function deletePurchaseOrder(companyId: string, id: string) {
  const existing = await getPurchaseOrder(companyId, id);

  if (existing.status !== 'draft' && existing.status !== 'cancelled') {
    throw new ConflictError('A sent purchase order cannot be deleted. Cancel it instead.');
  }

  const deleted = await repository.softDelete(companyId, id);

  if (!deleted) throw new NotFoundError('Purchase order not found.');

  logger.info('Purchase order deleted', { companyId, purchaseOrderId: id });

  return deleted;
}

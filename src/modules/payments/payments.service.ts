import 'server-only';

import Decimal from 'decimal.js';

import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import * as invoicesService from '@/modules/invoices/invoices.service';
import * as purchaseOrdersService from '@/modules/purchase-orders/purchase-orders.service';

import * as repository from './payments.repository';
import type { PaymentInput, PaymentUpdateInput } from './payments.validation';

/**
 * Payment rules — the module MEMORY.md calls out as the single writer to
 * `invoices.amountPaid`.
 *
 * A payment settles exactly one document, resolved from `direction` +
 * `documentId`; `currency`/`clientId`/`supplierId` are always derived from
 * that document, never trusted from the form (see the validation module
 * note). Only an inbound, `completed` payment ever touches `amountPaid` —
 * outbound payments against a purchase order are just a record; POs have no
 * equivalent aggregate column to maintain.
 *
 * The status machine mirrors Invoices' send/void/cancel shape: a payment can
 * only be *created* `pending` or `completed`; `failed` and `refunded` are
 * reachable only through dedicated transitions, never a status dropdown.
 */

export type { PaymentListItem, ListPaymentsQuery } from './payments.repository';

/** Invoice statuses with an outstanding balance — the only ones a new inbound payment can settle. */
const PAYABLE_INVOICE_STATUSES = ['sent', 'partially_paid', 'overdue'];
/** Purchase order statuses that have actually gone to a supplier — the only ones outbound can settle. */
const PAYABLE_PO_STATUSES = ['sent', 'confirmed', 'partially_received', 'received'];

interface ResolvedDocument {
  invoiceId: string | null;
  purchaseOrderId: string | null;
  clientId: string | null;
  supplierId: string | null;
  currency: string;
}

async function resolveDocument(
  companyId: string,
  direction: PaymentInput['direction'],
  documentId: string,
): Promise<ResolvedDocument> {
  if (direction === 'inbound') {
    const invoice = await invoicesService.getInvoice(companyId, documentId);

    if (!PAYABLE_INVOICE_STATUSES.includes(invoice.status)) {
      throw new ConflictError('That invoice has no outstanding balance to pay.');
    }

    return {
      invoiceId: invoice.id,
      purchaseOrderId: null,
      clientId: invoice.clientId,
      supplierId: null,
      currency: invoice.currency,
    };
  }

  const purchaseOrder = await purchaseOrdersService.getPurchaseOrder(companyId, documentId);

  if (!PAYABLE_PO_STATUSES.includes(purchaseOrder.status)) {
    throw new ConflictError('That purchase order has not been sent to the supplier yet.');
  }

  return {
    invoiceId: null,
    purchaseOrderId: purchaseOrder.id,
    clientId: null,
    supplierId: purchaseOrder.supplierId,
    currency: purchaseOrder.currency,
  };
}

/** Refuses a payment that would push `amountPaid` past `total` — the invoice's own outstanding balance. */
async function assertWithinInvoiceBalance(
  companyId: string,
  invoiceId: string,
  amount: string,
): Promise<void> {
  const invoice = await invoicesService.getInvoice(companyId, invoiceId);
  const outstanding = new Decimal(invoice.total).minus(invoice.amountPaid);

  if (new Decimal(amount).greaterThan(outstanding)) {
    throw new ValidationError(
      `Payment of ${amount} exceeds the invoice's outstanding balance of ${outstanding.toFixed(2)}.`,
    );
  }
}

export async function listPayments(companyId: string, query: repository.ListPaymentsQuery) {
  return repository.listPayments(companyId, query);
}

export async function getPayment(companyId: string, id: string) {
  const found = await repository.findById(companyId, id);

  if (!found) throw new NotFoundError('Payment not found.');

  return found;
}

export async function listPayableInvoices(companyId: string) {
  return repository.listPayableInvoices(companyId);
}

export async function listPayablePurchaseOrders(companyId: string) {
  return repository.listPayablePurchaseOrders(companyId);
}

export async function createPayment(companyId: string, actorUserId: string, input: PaymentInput) {
  const { direction, documentId, status, amount, ...rest } = input;
  const resolved = await resolveDocument(companyId, direction, documentId);

  if (direction === 'inbound' && status === 'completed' && resolved.invoiceId) {
    await assertWithinInvoiceBalance(companyId, resolved.invoiceId, amount);
  }

  const applyDelta = direction === 'inbound' && status === 'completed' ? amount : null;

  const created = await repository.create(
    companyId,
    {
      ...rest,
      direction,
      status,
      amount,
      invoiceId: resolved.invoiceId,
      purchaseOrderId: resolved.purchaseOrderId,
      clientId: resolved.clientId,
      supplierId: resolved.supplierId,
      currency: resolved.currency,
      recordedById: actorUserId,
    },
    applyDelta,
  );

  logger.info('Payment created', { companyId, paymentId: created.id, direction, status });

  return created;
}

/** Non-financial edit only — amount, direction, and the settled document can never change once created. */
export async function updatePayment(companyId: string, id: string, input: PaymentUpdateInput) {
  const updated = await repository.update(companyId, id, input);

  if (!updated) throw new NotFoundError('Payment not found.');

  logger.info('Payment updated', { companyId, paymentId: id });

  return updated;
}

/** Money actually cleared. Re-checks the invoice's balance at completion time, not at creation time. */
export async function markPaymentCompleted(companyId: string, id: string) {
  const existing = await getPayment(companyId, id);

  if (existing.status !== 'pending') {
    throw new ConflictError('Only a pending payment can be marked completed.');
  }

  if (existing.direction === 'inbound' && existing.invoiceId) {
    await assertWithinInvoiceBalance(companyId, existing.invoiceId, existing.amount);
  }

  const applyDelta = existing.direction === 'inbound' ? existing.amount : null;

  const updated = await repository.updateStatus(companyId, id, 'completed', applyDelta);

  if (!updated) throw new NotFoundError('Payment not found.');

  logger.info('Payment completed', { companyId, paymentId: id });

  return updated;
}

/** A pending payment that never cleared. Nothing to reverse — it never touched `amountPaid`. */
export async function markPaymentFailed(companyId: string, id: string) {
  const existing = await getPayment(companyId, id);

  if (existing.status !== 'pending') {
    throw new ConflictError('Only a pending payment can be marked failed.');
  }

  const updated = await repository.updateStatus(companyId, id, 'failed', null);

  if (!updated) throw new NotFoundError('Payment not found.');

  logger.info('Payment failed', { companyId, paymentId: id });

  return updated;
}

/** Reverses a completed payment's effect on the invoice — the correct way to undo money that already landed. */
export async function refundPayment(companyId: string, id: string) {
  const existing = await getPayment(companyId, id);

  if (existing.status !== 'completed') {
    throw new ConflictError('Only a completed payment can be refunded.');
  }

  const applyDelta = existing.direction === 'inbound' ? `-${existing.amount}` : null;

  const updated = await repository.updateStatus(companyId, id, 'refunded', applyDelta);

  if (!updated) throw new NotFoundError('Payment not found.');

  logger.info('Payment refunded', { companyId, paymentId: id });

  return updated;
}

/**
 * A completed payment is a financial fact — refund it, don't delete it, the
 * same posture Invoices takes toward a sent invoice (void, don't delete).
 * `pending`, `failed`, and `refunded` are all safe: none holds a live,
 * un-reversed effect on `amountPaid`.
 */
export async function deletePayment(companyId: string, id: string) {
  const existing = await getPayment(companyId, id);

  if (existing.status === 'completed') {
    throw new ConflictError('A completed payment cannot be deleted. Refund it instead.');
  }

  const deleted = await repository.softDelete(companyId, id);

  if (!deleted) throw new NotFoundError('Payment not found.');

  logger.info('Payment deleted', { companyId, paymentId: id });

  return deleted;
}

export async function exportPayments(companyId: string, query: Parameters<typeof repository.exportRows>[1]) {
  return repository.exportRows(companyId, query);
}

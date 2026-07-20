import { eq, inArray, like, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { clients, companies, invoices, payments, purchaseOrders, suppliers, user } from '@/db/schema';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import * as invoicesService from '@/modules/invoices/invoices.service';
import type { InvoiceInput } from '@/modules/invoices/invoices.validation';
import * as purchaseOrdersService from '@/modules/purchase-orders/purchase-orders.service';
import type { PurchaseOrderInput } from '@/modules/purchase-orders/purchase-orders.validation';

import * as service from './payments.service';
import type { PaymentInput } from './payments.validation';

/**
 * Against the real Postgres. Pins the module MEMORY.md calls out as the
 * single writer to `invoices.amountPaid`: the signed-increment math, the
 * derived `partially_paid`/`paid` transition (and its reversal on refund),
 * the outstanding-balance guard, the pending→completed/failed and
 * completed→refunded status machine, the delete-blocks-completed rule, and
 * cross-tenant access — all against a real invoice and purchase order, not
 * mocks.
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG_A = 'vitest-payments-a';
const SLUG_B = 'vitest-payments-b';
const CLIENT_NAME = 'vitest-payments-client';
const SUPPLIER_NAME = 'vitest-payments-supplier';
const FIXTURE = 'vitest-payments-';

/**
 * `payments.invoiceId`/`purchaseOrderId` are `restrict`, and `invoices.clientId`/
 * `purchase_orders.supplierId` are `restrict` in turn — three levels have to
 * clear in order: payments, then the documents, then the client/supplier.
 */
async function cleanup() {
  const fixtureClients = await db
    .select({ id: clients.id })
    .from(clients)
    .where(like(clients.name, `${CLIENT_NAME}%`));
  const clientIds = fixtureClients.map((row) => row.id);

  if (clientIds.length > 0) {
    const fixtureInvoices = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(inArray(invoices.clientId, clientIds));
    const invoiceIds = fixtureInvoices.map((row) => row.id);

    if (invoiceIds.length > 0) await db.delete(payments).where(inArray(payments.invoiceId, invoiceIds));
    await db.delete(invoices).where(inArray(invoices.clientId, clientIds));
  }

  const fixtureSuppliers = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(like(suppliers.name, `${SUPPLIER_NAME}%`));
  const supplierIds = fixtureSuppliers.map((row) => row.id);

  if (supplierIds.length > 0) {
    const fixturePOs = await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(inArray(purchaseOrders.supplierId, supplierIds));
    const poIds = fixturePOs.map((row) => row.id);

    if (poIds.length > 0) await db.delete(payments).where(inArray(payments.purchaseOrderId, poIds));
    await db.delete(purchaseOrders).where(inArray(purchaseOrders.supplierId, supplierIds));
  }

  await db.delete(user).where(like(user.email, `${FIXTURE}%`));
  await db.delete(clients).where(like(clients.name, `${CLIENT_NAME}%`));
  await db.delete(suppliers).where(like(suppliers.name, `${SUPPLIER_NAME}%`));
  await db.delete(companies).where(or(eq(companies.slug, SLUG_A), eq(companies.slug, SLUG_B)));
}

beforeEach(cleanup);
afterAll(cleanup);

async function fixture(slug: string) {
  const [company] = await db.insert(companies).values({ name: 'Vitest Co', slug }).returning();
  if (!company) throw new Error('fixture company failed');

  const [actor] = await db
    .insert(user)
    .values({
      name: 'Actor',
      email: `${FIXTURE}${slug}@nexus.test`,
      emailVerified: true,
      companyId: company.id,
    })
    .returning();
  const [client] = await db.insert(clients).values({ companyId: company.id, name: CLIENT_NAME }).returning();
  const [supplier] = await db
    .insert(suppliers)
    .values({ companyId: company.id, name: SUPPLIER_NAME })
    .returning();

  if (!client || !supplier) throw new Error('fixture client/supplier failed');

  return { company, actor: actor!, client, supplier };
}

function invoiceBase(clientId: string): InvoiceInput {
  return {
    clientId,
    contactId: null,
    projectId: null,
    title: 'Website redesign invoice',
    issueDate: new Date('2026-07-01T00:00:00Z'),
    dueDate: new Date('2026-08-01T00:00:00Z'),
    currency: 'EUR',
    notes: null,
    terms: null,
    items: [
      { description: 'Design', quantity: '1', unitPrice: '100.00', discountPercent: '0', taxRate: '0' },
    ],
  };
}

function poBase(supplierId: string): PurchaseOrderInput {
  return {
    supplierId,
    projectId: null,
    title: 'Office chairs',
    issueDate: new Date('2026-07-01T00:00:00Z'),
    expectedDate: null,
    currency: 'EUR',
    notes: null,
    terms: null,
    items: [
      { description: 'Chairs', quantity: '1', unitPrice: '500.00', discountPercent: '0', taxRate: '0' },
    ],
  };
}

/** A sent invoice, ready to be paid — `createInvoice` alone leaves it `draft`, unpayable. */
async function sentInvoice(companyId: string, actorId: string, clientId: string) {
  const created = await invoicesService.createInvoice(companyId, actorId, invoiceBase(clientId));
  await invoicesService.sendInvoice(companyId, created.id);
  return created;
}

async function sentPurchaseOrder(companyId: string, actorId: string, supplierId: string) {
  const created = await purchaseOrdersService.createPurchaseOrder(companyId, actorId, poBase(supplierId));
  await purchaseOrdersService.sendPurchaseOrder(companyId, created.id);
  return created;
}

function inboundInput(
  documentId: string,
  amount: string,
  status: 'pending' | 'completed' = 'completed',
): PaymentInput {
  return {
    direction: 'inbound',
    documentId,
    status,
    method: 'bank_transfer',
    amount,
    exchangeRate: null,
    paidAt: new Date('2026-07-15T00:00:00Z'),
    reference: null,
    notes: null,
  };
}

function outboundInput(
  documentId: string,
  amount: string,
  status: 'pending' | 'completed' = 'completed',
): PaymentInput {
  return { ...inboundInput(documentId, amount, status), direction: 'outbound' };
}

describe('createPayment — inbound, completed', () => {
  it('applies the payment to the invoice and derives partially_paid', async () => {
    const f = await fixture(SLUG_A);
    const invoice = await sentInvoice(f.company.id, f.actor.id, f.client.id);

    const payment = await service.createPayment(f.company.id, f.actor.id, inboundInput(invoice.id, '40.00'));

    expect(payment.clientId).toBe(f.client.id);
    expect(payment.currency).toBe('EUR');

    const reread = await invoicesService.getInvoice(f.company.id, invoice.id);
    expect(reread.amountPaid).toBe('40.00');
    expect(reread.status).toBe('partially_paid');
  });

  it('paying the full balance derives paid', async () => {
    const f = await fixture(SLUG_A);
    const invoice = await sentInvoice(f.company.id, f.actor.id, f.client.id);

    await service.createPayment(f.company.id, f.actor.id, inboundInput(invoice.id, '100.00'));

    const reread = await invoicesService.getInvoice(f.company.id, invoice.id);
    expect(reread.amountPaid).toBe('100.00');
    expect(reread.status).toBe('paid');
  });

  it('refuses a payment that exceeds the outstanding balance', async () => {
    const f = await fixture(SLUG_A);
    const invoice = await sentInvoice(f.company.id, f.actor.id, f.client.id);

    await expect(
      service.createPayment(f.company.id, f.actor.id, inboundInput(invoice.id, '150.00')),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses to pay a draft invoice', async () => {
    const f = await fixture(SLUG_A);
    const draft = await invoicesService.createInvoice(f.company.id, f.actor.id, invoiceBase(f.client.id));

    await expect(
      service.createPayment(f.company.id, f.actor.id, inboundInput(draft.id, '10.00')),
    ).rejects.toThrow(ConflictError);
  });
});

describe('createPayment — inbound, pending', () => {
  it('does not touch amountPaid until completed', async () => {
    const f = await fixture(SLUG_A);
    const invoice = await sentInvoice(f.company.id, f.actor.id, f.client.id);

    const payment = await service.createPayment(
      f.company.id,
      f.actor.id,
      inboundInput(invoice.id, '40.00', 'pending'),
    );

    expect(payment.status).toBe('pending');

    const reread = await invoicesService.getInvoice(f.company.id, invoice.id);
    expect(reread.amountPaid).toBe('0.00');
    expect(reread.status).toBe('sent');
  });
});

describe('createPayment — outbound', () => {
  it('records the payment against the purchase order with no invoice side effect', async () => {
    const f = await fixture(SLUG_A);
    const po = await sentPurchaseOrder(f.company.id, f.actor.id, f.supplier.id);

    const payment = await service.createPayment(f.company.id, f.actor.id, outboundInput(po.id, '500.00'));

    expect(payment.purchaseOrderId).toBe(po.id);
    expect(payment.supplierId).toBe(f.supplier.id);
    expect(payment.invoiceId).toBeNull();
  });

  it('refuses to pay a draft purchase order', async () => {
    const f = await fixture(SLUG_A);
    const draft = await purchaseOrdersService.createPurchaseOrder(
      f.company.id,
      f.actor.id,
      poBase(f.supplier.id),
    );

    await expect(
      service.createPayment(f.company.id, f.actor.id, outboundInput(draft.id, '10.00')),
    ).rejects.toThrow(ConflictError);
  });
});

describe('markPaymentCompleted', () => {
  it('applies a pending payment on completion', async () => {
    const f = await fixture(SLUG_A);
    const invoice = await sentInvoice(f.company.id, f.actor.id, f.client.id);
    const pending = await service.createPayment(
      f.company.id,
      f.actor.id,
      inboundInput(invoice.id, '40.00', 'pending'),
    );

    const completed = await service.markPaymentCompleted(f.company.id, pending.id);
    expect(completed.status).toBe('completed');

    const reread = await invoicesService.getInvoice(f.company.id, invoice.id);
    expect(reread.amountPaid).toBe('40.00');
    expect(reread.status).toBe('partially_paid');
  });

  it('refuses to complete a payment that is not pending', async () => {
    const f = await fixture(SLUG_A);
    const invoice = await sentInvoice(f.company.id, f.actor.id, f.client.id);
    const completed = await service.createPayment(
      f.company.id,
      f.actor.id,
      inboundInput(invoice.id, '40.00'),
    );

    await expect(service.markPaymentCompleted(f.company.id, completed.id)).rejects.toThrow(ConflictError);
  });
});

describe('markPaymentFailed', () => {
  it('fails a pending payment without touching amountPaid', async () => {
    const f = await fixture(SLUG_A);
    const invoice = await sentInvoice(f.company.id, f.actor.id, f.client.id);
    const pending = await service.createPayment(
      f.company.id,
      f.actor.id,
      inboundInput(invoice.id, '40.00', 'pending'),
    );

    const failed = await service.markPaymentFailed(f.company.id, pending.id);
    expect(failed.status).toBe('failed');

    const reread = await invoicesService.getInvoice(f.company.id, invoice.id);
    expect(reread.amountPaid).toBe('0.00');
  });

  it('refuses to fail a completed payment', async () => {
    const f = await fixture(SLUG_A);
    const invoice = await sentInvoice(f.company.id, f.actor.id, f.client.id);
    const completed = await service.createPayment(
      f.company.id,
      f.actor.id,
      inboundInput(invoice.id, '40.00'),
    );

    await expect(service.markPaymentFailed(f.company.id, completed.id)).rejects.toThrow(ConflictError);
  });
});

describe('refundPayment', () => {
  it('reverses the amountPaid effect and re-derives status down from paid to partially_paid', async () => {
    const f = await fixture(SLUG_A);
    const invoice = await sentInvoice(f.company.id, f.actor.id, f.client.id);

    await service.createPayment(f.company.id, f.actor.id, inboundInput(invoice.id, '40.00'));
    const second = await service.createPayment(f.company.id, f.actor.id, inboundInput(invoice.id, '60.00'));

    const afterBoth = await invoicesService.getInvoice(f.company.id, invoice.id);
    expect(afterBoth.status).toBe('paid');

    const refunded = await service.refundPayment(f.company.id, second.id);
    expect(refunded.status).toBe('refunded');

    const afterRefund = await invoicesService.getInvoice(f.company.id, invoice.id);
    expect(afterRefund.amountPaid).toBe('40.00');
    expect(afterRefund.status).toBe('partially_paid');
  });

  it('dropping back to zero re-derives sent', async () => {
    const f = await fixture(SLUG_A);
    const invoice = await sentInvoice(f.company.id, f.actor.id, f.client.id);
    const payment = await service.createPayment(f.company.id, f.actor.id, inboundInput(invoice.id, '40.00'));

    await service.refundPayment(f.company.id, payment.id);

    const reread = await invoicesService.getInvoice(f.company.id, invoice.id);
    expect(reread.amountPaid).toBe('0.00');
    expect(reread.status).toBe('sent');
  });

  it('refuses to refund a payment that is not completed', async () => {
    const f = await fixture(SLUG_A);
    const invoice = await sentInvoice(f.company.id, f.actor.id, f.client.id);
    const pending = await service.createPayment(
      f.company.id,
      f.actor.id,
      inboundInput(invoice.id, '40.00', 'pending'),
    );

    await expect(service.refundPayment(f.company.id, pending.id)).rejects.toThrow(ConflictError);
  });
});

describe('deletePayment', () => {
  it('refuses to delete a completed payment', async () => {
    const f = await fixture(SLUG_A);
    const invoice = await sentInvoice(f.company.id, f.actor.id, f.client.id);
    const completed = await service.createPayment(
      f.company.id,
      f.actor.id,
      inboundInput(invoice.id, '40.00'),
    );

    await expect(service.deletePayment(f.company.id, completed.id)).rejects.toThrow(ConflictError);
  });

  it('deletes a pending payment', async () => {
    const f = await fixture(SLUG_A);
    const invoice = await sentInvoice(f.company.id, f.actor.id, f.client.id);
    const pending = await service.createPayment(
      f.company.id,
      f.actor.id,
      inboundInput(invoice.id, '40.00', 'pending'),
    );

    await service.deletePayment(f.company.id, pending.id);

    await expect(service.getPayment(f.company.id, pending.id)).rejects.toThrow(NotFoundError);
  });

  it('deletes a refunded payment', async () => {
    const f = await fixture(SLUG_A);
    const invoice = await sentInvoice(f.company.id, f.actor.id, f.client.id);
    const payment = await service.createPayment(f.company.id, f.actor.id, inboundInput(invoice.id, '40.00'));
    await service.refundPayment(f.company.id, payment.id);

    await service.deletePayment(f.company.id, payment.id);

    await expect(service.getPayment(f.company.id, payment.id)).rejects.toThrow(NotFoundError);
  });
});

describe('cross-tenant access', () => {
  it('cannot read, complete, or delete another company’s payment', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);
    const bInvoice = await sentInvoice(b.company.id, b.actor.id, b.client.id);
    const bPayment = await service.createPayment(
      b.company.id,
      b.actor.id,
      inboundInput(bInvoice.id, '40.00', 'pending'),
    );

    await expect(service.getPayment(a.company.id, bPayment.id)).rejects.toThrow(NotFoundError);
    await expect(service.markPaymentCompleted(a.company.id, bPayment.id)).rejects.toThrow(NotFoundError);
    await expect(service.deletePayment(a.company.id, bPayment.id)).rejects.toThrow(NotFoundError);
  });

  it('refuses a document belonging to another tenant', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);
    const bInvoice = await sentInvoice(b.company.id, b.actor.id, b.client.id);

    await expect(
      service.createPayment(a.company.id, a.actor.id, inboundInput(bInvoice.id, '10.00')),
    ).rejects.toThrow(NotFoundError);
  });
});

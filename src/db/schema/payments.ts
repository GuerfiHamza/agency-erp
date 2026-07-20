import { char, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { CURRENCY_LENGTH, money, primaryKey, softDelete, timestamps } from './_shared';
import { user } from './auth';
import { clients } from './clients';
import { companies } from './companies';
import { paymentDirectionEnum, paymentMethodEnum, paymentStatusEnum } from './enums';
import { invoices } from './invoices';
import { purchaseOrders } from './purchase-orders';
import { suppliers } from './suppliers';

/**
 * Payments, in both directions.
 *
 * One table rather than separate receipts/disbursements: the shape is identical
 * and `direction` keeps the cash-flow report a single scan. `inbound` settles an
 * invoice; `outbound` settles a purchase order or reimburses an expense.
 *
 * Partial payments are the norm, so this is many-to-one against a document. The
 * payment service maintains `invoices.amountPaid` in the same transaction that
 * writes a completed inbound payment.
 */
export const payments = pgTable(
  'payments',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    direction: paymentDirectionEnum('direction').notNull(),
    status: paymentStatusEnum('status').notNull().default('completed'),
    method: paymentMethodEnum('method').notNull().default('bank_transfer'),

    amount: money('amount').notNull(),
    currency: char('currency', { length: CURRENCY_LENGTH }).notNull(),
    /**
     * Rate to the company's default currency at payment time. Null when the
     * payment is already in the default currency.
     */
    exchangeRate: text('exchange_rate'),

    /** When the money actually moved, which is rarely when the row was created. */
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),

    /** Bank reference / transaction id for reconciliation. */
    reference: text('reference'),
    notes: text('notes'),

    // Counterparty and settled document — which pair is set depends on direction.
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, { onDelete: 'restrict' }),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),

    recordedById: uuid('recorded_by_id').references(() => user.id, { onDelete: 'set null' }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index('payments_company_id_idx').on(table.companyId),
    index('payments_invoice_id_idx').on(table.invoiceId),
    index('payments_purchase_order_id_idx').on(table.purchaseOrderId),
    index('payments_client_id_idx').on(table.clientId),
    index('payments_supplier_id_idx').on(table.supplierId),
    // Backs the cash-flow report: scoped, split by direction, ordered by date.
    index('payments_direction_paid_at_idx').on(table.companyId, table.direction, table.paidAt),
    index('payments_deleted_at_idx').on(table.deletedAt),
  ],
);

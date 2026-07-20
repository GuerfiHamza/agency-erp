import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import {
  documentTotals,
  lineItemColumns,
  liveRows,
  money,
  primaryKey,
  softDelete,
  timestamps,
} from './_shared';
import { user } from './auth';
import { clients, contacts } from './clients';
import { companies } from './companies';
import { invoiceStatusEnum } from './enums';
import { proformaInvoices } from './proforma-invoices';
import { projects } from './projects';
import { quotes } from './quotes';

/**
 * Invoices — the receivable, and the legal record.
 *
 * `clientId` is `ON DELETE restrict`, unlike most client links: an issued
 * invoice must survive attempts to remove the client it was issued to.
 */
export const invoices = pgTable(
  'invoices',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
    proformaInvoiceId: uuid('proforma_invoice_id').references(() => proformaInvoices.id, {
      onDelete: 'set null',
    }),

    /** Sequential per company and legally significant — gaps invite audit questions. */
    number: text('number').notNull(),
    title: text('title'),
    status: invoiceStatusEnum('status').notNull().default('draft'),

    issueDate: timestamp('issue_date', { withTimezone: true }).notNull().defaultNow(),
    dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    /** Cancelling a sent invoice is a void, never a delete. */
    voidedAt: timestamp('voided_at', { withTimezone: true }),

    ...documentTotals,

    /**
     * Denormalised sum of completed inbound payments, maintained by the payment
     * service inside the same transaction as the payment. Stored because
     * `status` and aging reports depend on it on every read; the service is the
     * single writer, and a reconciliation check belongs in Phase 5.
     */
    amountPaid: money('amount_paid').notNull().default('0'),

    notes: text('notes'),
    terms: text('terms'),

    createdById: uuid('created_by_id').references(() => user.id, { onDelete: 'set null' }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex('invoices_company_number_unique').on(table.companyId, table.number).where(liveRows),
    index('invoices_company_id_idx').on(table.companyId),
    index('invoices_client_id_idx').on(table.clientId),
    index('invoices_status_idx').on(table.companyId, table.status),
    index('invoices_project_id_idx').on(table.projectId),
    // Backs the aging report and the overdue sweep.
    index('invoices_due_date_idx').on(table.companyId, table.dueDate),
    index('invoices_issue_date_idx').on(table.companyId, table.issueDate),
    index('invoices_deleted_at_idx').on(table.deletedAt),
  ],
);

export const invoiceItems = pgTable(
  'invoice_items',
  {
    id: primaryKey(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    ...lineItemColumns,
    ...timestamps,
  },
  (table) => [index('invoice_items_invoice_id_idx').on(table.invoiceId)],
);

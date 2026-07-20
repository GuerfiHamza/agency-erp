import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { documentTotals, lineItemColumns, liveRows, primaryKey, softDelete, timestamps } from './_shared';
import { user } from './auth';
import { clients, contacts } from './clients';
import { companies } from './companies';
import { proformaInvoiceStatusEnum } from './enums';
import { projects } from './projects';
import { quotes } from './quotes';

/**
 * Proforma invoices — a commitment to invoice, not a receivable.
 *
 * Kept as its own table rather than a flag on `invoices` because it must never
 * appear in revenue, tax, or aging reports. Sharing the invoices table would
 * make every financial query depend on remembering an exclusion filter, and the
 * first forgotten `WHERE` would overstate revenue.
 */
export const proformaInvoices = pgTable(
  'proforma_invoices',
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
    /** Source quote, when this was converted from one. */
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),

    number: text('number').notNull(),
    title: text('title'),
    status: proformaInvoiceStatusEnum('status').notNull().default('draft'),

    issueDate: timestamp('issue_date', { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    /** Set when a real invoice is issued from this proforma. */
    convertedAt: timestamp('converted_at', { withTimezone: true }),

    ...documentTotals,

    notes: text('notes'),
    terms: text('terms'),

    createdById: uuid('created_by_id').references(() => user.id, { onDelete: 'set null' }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex('proforma_invoices_company_number_unique').on(table.companyId, table.number).where(liveRows),
    index('proforma_invoices_company_id_idx').on(table.companyId),
    index('proforma_invoices_client_id_idx').on(table.clientId),
    index('proforma_invoices_status_idx').on(table.companyId, table.status),
    index('proforma_invoices_quote_id_idx').on(table.quoteId),
    index('proforma_invoices_deleted_at_idx').on(table.deletedAt),
  ],
);

export const proformaInvoiceItems = pgTable(
  'proforma_invoice_items',
  {
    id: primaryKey(),
    proformaInvoiceId: uuid('proforma_invoice_id')
      .notNull()
      .references(() => proformaInvoices.id, { onDelete: 'cascade' }),
    ...lineItemColumns,
    ...timestamps,
  },
  (table) => [index('proforma_invoice_items_proforma_invoice_id_idx').on(table.proformaInvoiceId)],
);

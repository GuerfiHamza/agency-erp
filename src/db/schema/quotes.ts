import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { documentTotals, lineItemColumns, liveRows, primaryKey, softDelete, timestamps } from './_shared';
import { user } from './auth';
import { clients, contacts } from './clients';
import { companies } from './companies';
import { quoteStatusEnum } from './enums';
import { opportunities } from './crm';
import { projects } from './projects';

/** Quotes — the first commercial document; may convert into a proforma or invoice. */
export const quotes = pgTable(
  'quotes',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),

    /** Human reference, e.g. "QUO-2026-0001". Unique per company. */
    number: text('number').notNull(),
    title: text('title'),
    status: quoteStatusEnum('status').notNull().default('draft'),

    issueDate: timestamp('issue_date', { withTimezone: true }).notNull().defaultNow(),
    /** After this date the quote is no longer honoured. */
    validUntil: timestamp('valid_until', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),

    ...documentTotals,

    /** Shown on the document. */
    notes: text('notes'),
    /** Payment/scope terms printed on the document. */
    terms: text('terms'),

    createdById: uuid('created_by_id').references(() => user.id, { onDelete: 'set null' }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex('quotes_company_number_unique').on(table.companyId, table.number).where(liveRows),
    index('quotes_company_id_idx').on(table.companyId),
    index('quotes_client_id_idx').on(table.clientId),
    index('quotes_status_idx').on(table.companyId, table.status),
    index('quotes_issue_date_idx').on(table.companyId, table.issueDate),
    index('quotes_deleted_at_idx').on(table.deletedAt),
  ],
);

export const quoteItems = pgTable(
  'quote_items',
  {
    id: primaryKey(),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'cascade' }),
    ...lineItemColumns,
    ...timestamps,
  },
  (table) => [index('quote_items_quote_id_idx').on(table.quoteId)],
);

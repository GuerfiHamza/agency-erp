import { boolean, char, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { CURRENCY_LENGTH, money, primaryKey, softDelete, timestamps } from './_shared';
import { user } from './auth';
import { companies } from './companies';
import { expenseCategoryEnum, expenseStatusEnum } from './enums';
import { projects } from './projects';
import { suppliers } from './suppliers';

/**
 * Expenses and their approval trail.
 *
 * `billable` marks spend to be re-charged to a client; `invoicedAt` records
 * that it has been, so the same cost cannot be billed twice.
 */
export const expenses = pgTable(
  'expenses',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    description: text('description').notNull(),
    category: expenseCategoryEnum('category').notNull().default('other'),
    status: expenseStatusEnum('status').notNull().default('draft'),

    amount: money('amount').notNull(),
    /** Recoverable tax, tracked separately from `amount` for VAT returns. */
    taxAmount: money('tax_amount').notNull().default('0'),
    currency: char('currency', { length: CURRENCY_LENGTH }).notNull(),

    /** The date on the receipt, not the submission date. */
    spentOn: timestamp('spent_on', { withTimezone: true }).notNull(),

    /** Re-chargeable to the client of `projectId`. */
    billable: boolean('billable').notNull().default(false),
    /** Set once re-charged, so it cannot be billed twice. */
    invoicedAt: timestamp('invoiced_at', { withTimezone: true }),

    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),

    /** Who incurred it — the person to reimburse. */
    userId: uuid('user_id').references(() => user.id, { onDelete: 'set null' }),

    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    approvedById: uuid('approved_by_id').references(() => user.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    /** Required by the service when status is `rejected`. */
    rejectionReason: text('rejection_reason'),
    reimbursedAt: timestamp('reimbursed_at', { withTimezone: true }),

    /** Object storage key for the receipt image/PDF. */
    receiptStorageKey: text('receipt_storage_key'),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index('expenses_company_id_idx').on(table.companyId),
    index('expenses_project_id_idx').on(table.projectId),
    index('expenses_user_id_idx').on(table.userId),
    index('expenses_supplier_id_idx').on(table.supplierId),
    index('expenses_status_idx').on(table.companyId, table.status),
    index('expenses_spent_on_idx').on(table.companyId, table.spentOn),
    index('expenses_deleted_at_idx').on(table.deletedAt),
  ],
);

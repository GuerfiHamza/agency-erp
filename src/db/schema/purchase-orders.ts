import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import {
  documentTotals,
  lineItemColumns,
  liveRows,
  primaryKey,
  quantity,
  softDelete,
  timestamps,
} from './_shared';
import { user } from './auth';
import { companies } from './companies';
import { purchaseOrderStatusEnum } from './enums';
import { projects } from './projects';
import { suppliers } from './suppliers';

/** Purchase orders — the outbound counterpart to invoices. */
export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    /** Set when the spend is billable to a project. */
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),

    number: text('number').notNull(),
    title: text('title'),
    status: purchaseOrderStatusEnum('status').notNull().default('draft'),

    issueDate: timestamp('issue_date', { withTimezone: true }).notNull().defaultNow(),
    expectedDate: timestamp('expected_date', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }),

    ...documentTotals,

    notes: text('notes'),
    terms: text('terms'),

    createdById: uuid('created_by_id').references(() => user.id, { onDelete: 'set null' }),
    /** Null until someone with spend authority approves it. */
    approvedById: uuid('approved_by_id').references(() => user.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex('purchase_orders_company_number_unique').on(table.companyId, table.number).where(liveRows),
    index('purchase_orders_company_id_idx').on(table.companyId),
    index('purchase_orders_supplier_id_idx').on(table.supplierId),
    index('purchase_orders_status_idx').on(table.companyId, table.status),
    index('purchase_orders_project_id_idx').on(table.projectId),
    index('purchase_orders_deleted_at_idx').on(table.deletedAt),
  ],
);

export const purchaseOrderItems = pgTable(
  'purchase_order_items',
  {
    id: primaryKey(),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    ...lineItemColumns,
    /** Supports partial deliveries; drives the `partially_received` status. */
    quantityReceived: quantity('quantity_received').notNull().default('0'),
    ...timestamps,
  },
  (table) => [index('purchase_order_items_purchase_order_id_idx').on(table.purchaseOrderId)],
);

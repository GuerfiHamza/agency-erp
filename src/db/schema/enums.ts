import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Postgres enums.
 *
 * Centralised so a status value is defined once and reused by the schema, Zod
 * validation, and the UI. Adding a value is cheap (`ALTER TYPE ... ADD VALUE`);
 * removing or reordering one is a rewrite, so keep lists append-only in
 * production.
 */

export const companyStatusEnum = pgEnum('company_status', ['active', 'inactive', 'suspended']);

export const clientStatusEnum = pgEnum('client_status', ['prospect', 'active', 'inactive', 'archived']);

/** Distinguishes a company client from an individual — they need different fields. */
export const clientTypeEnum = pgEnum('client_type', ['company', 'individual']);

export const leadStatusEnum = pgEnum('lead_status', [
  'new',
  'contacted',
  'qualified',
  'unqualified',
  'converted',
]);

export const leadSourceEnum = pgEnum('lead_source', [
  'website',
  'referral',
  'cold_outreach',
  'social_media',
  'event',
  'advertisement',
  'other',
]);

export const opportunityStageEnum = pgEnum('opportunity_stage', [
  'discovery',
  'qualification',
  'proposal',
  'negotiation',
  'won',
  'lost',
]);

export const activityTypeEnum = pgEnum('activity_type', ['call', 'email', 'meeting', 'note']);

export const projectStatusEnum = pgEnum('project_status', [
  'planning',
  'active',
  'on_hold',
  'completed',
  'cancelled',
]);

/** How a project is billed. Drives which financial fields the UI requires. */
export const billingTypeEnum = pgEnum('billing_type', ['fixed_price', 'hourly', 'retainer', 'non_billable']);

export const taskStatusEnum = pgEnum('task_status', [
  'todo',
  'in_progress',
  'in_review',
  'done',
  'cancelled',
]);

export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high', 'urgent']);

export const documentTypeEnum = pgEnum('document_type', [
  'contract',
  'brief',
  'deliverable',
  'invoice',
  'receipt',
  'image',
  'other',
]);

export const eventTypeEnum = pgEnum('event_type', ['meeting', 'call', 'deadline', 'reminder', 'other']);

export const attendeeStatusEnum = pgEnum('attendee_status', ['invited', 'accepted', 'declined', 'tentative']);

export const quoteStatusEnum = pgEnum('quote_status', [
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired',
  'cancelled',
]);

export const proformaInvoiceStatusEnum = pgEnum('proforma_invoice_status', [
  'draft',
  'sent',
  'accepted',
  'converted',
  'cancelled',
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'sent',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
  'void',
]);

export const purchaseOrderStatusEnum = pgEnum('purchase_order_status', [
  'draft',
  'sent',
  'confirmed',
  'partially_received',
  'received',
  'cancelled',
]);

export const supplierStatusEnum = pgEnum('supplier_status', ['active', 'inactive', 'archived']);

/** Inbound = money received (invoices); outbound = money paid (purchase orders, expenses). */
export const paymentDirectionEnum = pgEnum('payment_direction', ['inbound', 'outbound']);

export const paymentMethodEnum = pgEnum('payment_method', [
  'cash',
  'bank_transfer',
  'credit_card',
  'debit_card',
  'check',
  'paypal',
  'stripe',
  'other',
]);

export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'completed', 'failed', 'refunded']);

export const expenseStatusEnum = pgEnum('expense_status', [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'reimbursed',
]);

export const expenseCategoryEnum = pgEnum('expense_category', [
  'travel',
  'meals',
  'software',
  'hardware',
  'office',
  'marketing',
  'subcontractor',
  'utilities',
  'other',
]);

export const notificationTypeEnum = pgEnum('notification_type', [
  'task_assigned',
  'task_due',
  'project_updated',
  'invoice_sent',
  'invoice_paid',
  'invoice_overdue',
  'quote_accepted',
  'expense_submitted',
  'expense_approved',
  'mention',
  'system',
]);

/** Scope of a settings row: company-wide default, or a single user's override. */
export const settingScopeEnum = pgEnum('setting_scope', ['company', 'user']);

export const reportTypeEnum = pgEnum('report_type', [
  'revenue',
  'expenses',
  'profit_loss',
  'project_profitability',
  'client_activity',
  'team_utilization',
  'invoice_aging',
]);

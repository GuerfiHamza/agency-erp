import { char, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { CURRENCY_LENGTH, money, percent, primaryKey, softDelete, timestamps } from './_shared';
import { user } from './auth';
import { clients, contacts } from './clients';
import { companies } from './companies';
import { activityTypeEnum, leadSourceEnum, leadStatusEnum, opportunityStageEnum } from './enums';

/**
 * CRM: the pipeline before a client becomes billable.
 *
 * A lead is an unqualified enquiry and deliberately holds its own contact
 * details rather than requiring a client record — creating a client for every
 * cold enquiry would pollute the client list. On qualification a lead converts:
 * `convertedClientId` records where it went, and the lead is kept for funnel
 * reporting rather than deleted.
 */

export const leads = pgTable(
  'leads',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    companyName: text('company_name'),
    email: text('email'),
    phone: text('phone'),

    status: leadStatusEnum('status').notNull().default('new'),
    source: leadSourceEnum('source').notNull().default('other'),
    estimatedValue: money('estimated_value'),
    currency: char('currency', { length: CURRENCY_LENGTH }),

    ownerId: uuid('owner_id').references(() => user.id, { onDelete: 'set null' }),

    /** Set on conversion; the lead row is retained for funnel reporting. */
    convertedClientId: uuid('converted_client_id').references(() => clients.id, { onDelete: 'set null' }),
    convertedAt: timestamp('converted_at', { withTimezone: true }),

    notes: text('notes'),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index('leads_company_id_idx').on(table.companyId),
    index('leads_status_idx').on(table.companyId, table.status),
    index('leads_owner_id_idx').on(table.ownerId),
    index('leads_deleted_at_idx').on(table.deletedAt),
  ],
);

/** A qualified deal in the pipeline, always attached to a real client. */
export const opportunities = pgTable(
  'opportunities',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),

    name: text('name').notNull(),
    stage: opportunityStageEnum('stage').notNull().default('discovery'),
    value: money('value'),
    currency: char('currency', { length: CURRENCY_LENGTH }),
    /** Close probability, 0–100. Weighted forecast = value × probability. */
    probability: percent('probability'),

    expectedCloseDate: timestamp('expected_close_date', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    /** Why a deal was lost — the most useful field in the table, and often empty. */
    lostReason: text('lost_reason'),

    ownerId: uuid('owner_id').references(() => user.id, { onDelete: 'set null' }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index('opportunities_company_id_idx').on(table.companyId),
    index('opportunities_client_id_idx').on(table.clientId),
    index('opportunities_stage_idx').on(table.companyId, table.stage),
    index('opportunities_owner_id_idx').on(table.ownerId),
    index('opportunities_deleted_at_idx').on(table.deletedAt),
  ],
);

/**
 * A logged interaction (call, email, meeting, note).
 *
 * Attaches to a lead, a client, or an opportunity via nullable foreign keys —
 * all three optional, so the timeline can hang off whichever exists. Real
 * foreign keys are used rather than a polymorphic `entity_type`/`entity_id`
 * pair so the database still enforces that the target exists.
 */
export const activities = pgTable(
  'activities',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    type: activityTypeEnum('type').notNull(),
    subject: text('subject').notNull(),
    body: text('body'),

    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),

    /** When it happened — not when the row was written. */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),

    createdById: uuid('created_by_id').references(() => user.id, { onDelete: 'set null' }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index('activities_company_id_idx').on(table.companyId),
    index('activities_lead_id_idx').on(table.leadId),
    index('activities_client_id_idx').on(table.clientId),
    index('activities_opportunity_id_idx').on(table.opportunityId),
    index('activities_occurred_at_idx').on(table.companyId, table.occurredAt),
    index('activities_deleted_at_idx').on(table.deletedAt),
  ],
);

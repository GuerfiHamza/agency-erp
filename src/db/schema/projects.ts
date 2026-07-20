import {
  char,
  index,
  pgTable,
  primaryKey as compositeKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { CURRENCY_LENGTH, liveRows, money, primaryKey, quantity, softDelete, timestamps } from './_shared';
import { user } from './auth';
import { clients } from './clients';
import { companies } from './companies';
import { billingTypeEnum, priorityEnum, projectStatusEnum } from './enums';

export const projects = pgTable(
  'projects',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** Internal projects have no client, so this stays nullable. */
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),

    name: text('name').notNull(),
    /** Human-facing reference, e.g. "PRJ-2026-001". Unique per company. */
    code: text('code').notNull(),
    description: text('description'),

    status: projectStatusEnum('status').notNull().default('planning'),
    priority: priorityEnum('priority').notNull().default('medium'),
    billingType: billingTypeEnum('billing_type').notNull().default('fixed_price'),

    /** Agreed price for fixed_price work; null for hourly. */
    budget: money('budget'),
    hourlyRate: money('hourly_rate'),
    /** Planned effort, for burn-down against logged time. */
    estimatedHours: quantity('estimated_hours'),
    currency: char('currency', { length: CURRENCY_LENGTH }),

    startDate: timestamp('start_date', { withTimezone: true }),
    /** Contractual end. `completedAt` records what actually happened. */
    endDate: timestamp('end_date', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    /** Accountable lead. `set null` so a departure never blocks the row. */
    managerId: uuid('manager_id').references(() => user.id, { onDelete: 'set null' }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex('projects_company_code_unique').on(table.companyId, table.code).where(liveRows),
    index('projects_company_id_idx').on(table.companyId),
    index('projects_client_id_idx').on(table.clientId),
    index('projects_status_idx').on(table.companyId, table.status),
    index('projects_manager_id_idx').on(table.managerId),
    index('projects_deleted_at_idx').on(table.deletedAt),
  ],
);

/**
 * Project team membership.
 *
 * Composite key makes a duplicate assignment impossible at the database level.
 */
export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Free text (e.g. "Designer") — a job on the project, not an RBAC role. */
    role: text('role'),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    compositeKey({ columns: [table.projectId, table.userId] }),
    index('project_members_user_id_idx').on(table.userId),
  ],
);

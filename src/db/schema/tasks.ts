import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { money, primaryKey, quantity, softDelete, timestamps } from './_shared';
import { user } from './auth';
import { companies } from './companies';
import { priorityEnum, taskStatusEnum } from './enums';
import { projects } from './projects';

export const tasks = pgTable(
  'tasks',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),

    /**
     * Self-reference for subtasks. `cascade` so deleting a parent removes its
     * children rather than orphaning them into an invisible tree.
     *
     * The `AnyPgColumn` annotation is required: without it TypeScript cannot
     * resolve the table's type while it is still being defined.
     */
    parentTaskId: uuid('parent_task_id').references((): AnyPgColumn => tasks.id, { onDelete: 'cascade' }),

    title: text('title').notNull(),
    description: text('description'),

    status: taskStatusEnum('status').notNull().default('todo'),
    priority: priorityEnum('priority').notNull().default('medium'),

    assigneeId: uuid('assignee_id').references(() => user.id, { onDelete: 'set null' }),
    createdById: uuid('created_by_id').references(() => user.id, { onDelete: 'set null' }),

    estimatedHours: quantity('estimated_hours'),
    /** Denormalised from time_entries by the service; reporting reads it constantly. */
    loggedHours: quantity('logged_hours').notNull().default('0'),

    startDate: timestamp('start_date', { withTimezone: true }),
    dueDate: timestamp('due_date', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    /** Manual ordering within a board column. */
    position: integer('position').notNull().default(0),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index('tasks_company_id_idx').on(table.companyId),
    index('tasks_project_id_idx').on(table.projectId),
    index('tasks_assignee_id_idx').on(table.assigneeId),
    index('tasks_status_idx').on(table.companyId, table.status),
    index('tasks_parent_task_id_idx').on(table.parentTaskId),
    // Drives the "my overdue work" query, which every dashboard opens with.
    index('tasks_due_date_idx').on(table.companyId, table.dueDate),
    index('tasks_deleted_at_idx').on(table.deletedAt),
  ],
);

export const taskComments = pgTable(
  'task_comments',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => user.id, { onDelete: 'set null' }),

    body: text('body').notNull(),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index('task_comments_task_id_idx').on(table.taskId),
    index('task_comments_company_id_idx').on(table.companyId),
    index('task_comments_deleted_at_idx').on(table.deletedAt),
  ],
);

/**
 * Time tracking — the source of truth for `tasks.loggedHours` and for hourly
 * billing.
 *
 * `hourlyRate` is copied onto the entry when it is logged rather than read from
 * the project, so raising a rate next quarter cannot retroactively change what
 * past work was worth.
 */
export const timeEntries = pgTable(
  'time_entries',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    description: text('description'),
    hours: quantity('hours').notNull(),
    /** The work date, which is not always the row's creation date. */
    workedOn: timestamp('worked_on', { withTimezone: true }).notNull(),

    billable: boolean('billable').notNull().default(true),
    /** Rate captured at logging time so later rate changes never rewrite history. */
    hourlyRate: money('hourly_rate'),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index('time_entries_company_id_idx').on(table.companyId),
    index('time_entries_project_id_idx').on(table.projectId),
    index('time_entries_task_id_idx').on(table.taskId),
    index('time_entries_user_id_idx').on(table.userId),
    index('time_entries_worked_on_idx').on(table.companyId, table.workedOn),
    index('time_entries_deleted_at_idx').on(table.deletedAt),
  ],
);

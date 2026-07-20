import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { primaryKey, timestamps } from './_shared';
import { user } from './auth';
import { companies } from './companies';
import { notificationTypeEnum } from './enums';

/**
 * In-app notifications.
 *
 * No soft delete: dismissing a notification should remove it, and retaining
 * every read notification forever would make this the largest table in the
 * database for no analytical value.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    type: notificationTypeEnum('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),

    /**
     * Deep link to the subject, e.g. "/invoices/{id}". Stored as a path rather
     * than a foreign key because the target spans every module.
     */
    linkPath: text('link_path'),
    /** Type-specific payload for rendering. Kept small — this is not an event log. */
    data: jsonb('data'),

    readAt: timestamp('read_at', { withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    index('notifications_user_id_idx').on(table.userId),
    index('notifications_company_id_idx').on(table.companyId),
    // Partial index over unread rows only: the badge count runs on every page
    // load and the unread set stays small even as the table grows.
    index('notifications_unread_idx')
      .on(table.userId, table.createdAt)
      .where(sql`read_at IS NULL`),
  ],
);

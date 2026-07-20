import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './_shared';
import { user } from './auth';
import { companies } from './companies';
import { reportTypeEnum, settingScopeEnum } from './enums';

/**
 * Settings — company defaults with optional per-user overrides.
 *
 * Key/value with a `jsonb` payload rather than a wide column-per-setting table:
 * settings accrete constantly, and a migration per preference is not worth it.
 * The trade-off is that shape is enforced by Zod in the settings service, not by
 * the database — so nothing may read `value` without parsing it first.
 */
export const settings = pgTable(
  'settings',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    scope: settingScopeEnum('scope').notNull().default('company'),
    /** Set only when scope is `user`; null rows are the company default. */
    userId: uuid('user_id').references(() => user.id, { onDelete: 'cascade' }),

    /** Dotted namespace, e.g. "invoicing.number_prefix". */
    key: text('key').notNull(),
    value: jsonb('value').notNull(),

    ...timestamps,
  },
  (table) => [
    // Two partial uniques rather than one over (company, user, key): in Postgres
    // NULL never equals NULL, so a plain unique would let duplicate company-level
    // rows (user_id IS NULL) coexist silently.
    uniqueIndex('settings_company_key_unique')
      .on(table.companyId, table.key)
      .where(sql`user_id IS NULL`),
    uniqueIndex('settings_user_key_unique')
      .on(table.companyId, table.userId, table.key)
      .where(sql`user_id IS NOT NULL`),
    index('settings_company_id_idx').on(table.companyId),
    index('settings_user_id_idx').on(table.userId),
  ],
);

/**
 * Saved report definitions.
 *
 * Reports are computed from the operational tables on demand; only the query
 * that produces one is persisted. Snapshotting results would freeze numbers that
 * must stay live.
 */
export const savedReports = pgTable(
  'saved_reports',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    type: reportTypeEnum('type').notNull(),
    /** Filter/grouping definition, validated by the report service before use. */
    config: jsonb('config').notNull(),

    ownerId: uuid('owner_id').references(() => user.id, { onDelete: 'set null' }),

    ...timestamps,
  },
  (table) => [
    index('saved_reports_company_id_idx').on(table.companyId),
    index('saved_reports_owner_id_idx').on(table.ownerId),
  ],
);

import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { liveRows, primaryKey, softDelete, timestamps } from './_shared';
import { companies } from './companies';

/**
 * Better Auth core tables, plus the ERP's own columns on `user`.
 *
 * Two contracts are fixed by the library and must not be "tidied":
 *
 * 1. Property names are camelCase because the Drizzle adapter resolves columns
 *    via `schemaModel[fieldName]`. Renaming one breaks auth at runtime, not at
 *    compile time.
 * 2. Ids are `uuid ... DEFAULT gen_random_uuid()`. With
 *    `advanced.database.generateId: "uuid"` and a pg adapter (which reports
 *    `supportsUUIDs: true`), Better Auth sends no id and requires the database
 *    default to fill it in.
 *
 * Source of truth: `node_modules/@better-auth/core/dist/db/get-tables.mjs` and
 * `.../db/adapter/get-id-field.mjs`.
 *
 * Columns added below Better Auth's set are all nullable or defaulted, because
 * sign-up inserts rows without knowing about them.
 */

export const user = pgTable(
  'user',
  {
    id: primaryKey(),

    // ---- Better Auth managed ----
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),

    // ---- ERP additions ----
    /**
     * Nullable by necessity: Better Auth creates the row during sign-up, before
     * the user has joined or created a company. Phase 3 assigns it via a
     * database hook during onboarding.
     */
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    phone: text('phone'),
    jobTitle: text('job_title'),
    /** Distinct from soft delete: a deactivated user still owns their records. */
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    // Partial unique: a soft-deleted user must not permanently block re-use of
    // their email address.
    uniqueIndex('user_email_unique').on(table.email).where(liveRows),
    index('user_company_id_idx').on(table.companyId),
    index('user_deleted_at_idx').on(table.deletedAt),
  ],
);

export const session = pgTable(
  'session',
  {
    id: primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [index('session_user_id_idx').on(table.userId), index('session_token_idx').on(table.token)],
);

export const account = pgTable(
  'account',
  {
    id: primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    /** Scrypt hash written by Better Auth. Never selected into a client payload. */
    password: text('password'),
    ...timestamps,
  },
  (table) => [
    index('account_user_id_idx').on(table.userId),
    // One row per provider identity; also makes provider lookups an index hit.
    uniqueIndex('account_provider_account_unique').on(table.providerId, table.accountId),
  ],
);

export const verification = pgTable(
  'verification',
  {
    id: primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

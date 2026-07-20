import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { primaryKey, softDelete, timestamps } from './_shared';
import { user } from './auth';
import { companies } from './companies';
import { roles } from './rbac';

/**
 * Pending invitations to join a company.
 *
 * Exists because there is no other honest way to add a user. Better Auth owns
 * user creation, and `signUpEmail` returns a **synthetic, never-inserted id**
 * for an address that already exists — an anti-enumeration measure, and a trap
 * for anyone trying to provision off the returned id. So an admin cannot create
 * the row directly; they record an intent here, and the user row is created when
 * the invitee accepts and chooses their own password.
 *
 * Added in Phase 5 (2026-07-17), after the user chose the invitation flow over
 * reusing Better Auth's `verification` table. This is the 37th table.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: primaryKey(),

    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    email: text('email').notNull(),

    /**
     * The role granted on acceptance.
     *
     * `restrict`, not `cascade`: deleting a role that people have been invited
     * into must fail loudly rather than silently downgrade them to no role at
     * all when they accept.
     */
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),

    /**
     * A bearer credential — whoever holds it can join the company as `roleId`.
     * Stored hashed, never in plaintext: a database leak must not be a set of
     * working invitation links. Unique so acceptance is a single indexed lookup.
     */
    tokenHash: text('token_hash').notNull(),

    /** `set null`: an admin leaving must not delete the invitations they sent. */
    invitedBy: uuid('invited_by').references(() => user.id, { onDelete: 'set null' }),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Null while pending. Set once, which is what makes the token single-use. */
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex('invitations_token_hash_unique').on(table.tokenHash),

    /**
     * One live invitation per address per company.
     *
     * Partial over *pending* rows only, not just live ones: once an invitation
     * is accepted or revoked, the same person must be re-invitable. A plain
     * unique index would let one accepted invitation block that address forever.
     */
    uniqueIndex('invitations_company_email_pending_unique')
      .on(table.companyId, table.email)
      .where(sql`${table.acceptedAt} IS NULL AND ${table.deletedAt} IS NULL`),

    index('invitations_company_id_idx').on(table.companyId),
    index('invitations_email_idx').on(table.email),
    index('invitations_deleted_at_idx').on(table.deletedAt),
  ],
);

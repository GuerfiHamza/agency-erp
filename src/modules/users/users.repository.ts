import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { invitations, roles, user, userRoles } from '@/db/schema';
import { buildPaginatedResult, toOffset } from '@/lib/helpers';
import type { PaginatedResult, PaginationParams, SortDirection } from '@/types';

import type { UpdateUserInput, UserSortField, UserStatusFilter } from './users.validation';

/**
 * User and invitation data access. The only place in the module that touches
 * Drizzle.
 *
 * Every query is scoped by `companyId`. That is the tenant boundary, and it is
 * a parameter on every function here rather than something a caller may forget:
 * a users list that leaks across companies leaks names and email addresses.
 *
 * Not marked `server-only` — the same reason as `rbac.repository.ts`: scripts
 * need it, and the ESLint boundary already stops UI importing `@/db`.
 */

export type UserRow = typeof user.$inferSelect;
export type InvitationRow = typeof invitations.$inferSelect;

/** A user as the list shows them: profile plus their roles, in one round trip. */
export interface UserListItem {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  phone: string | null;
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  roles: { id: string; name: string; slug: string }[];
}

const liveUser = (companyId: string) => and(eq(user.companyId, companyId), isNull(user.deletedAt)) as SQL;

/**
 * Roles aggregated per user as JSON.
 *
 * A correlated aggregate rather than a second query per row: the alternative is
 * N+1 across a paginated list, and `json_agg` lets Postgres do the shaping it is
 * already good at. `coalesce` keeps a user with no roles as `[]` rather than null.
 *
 * The aliases are load-bearing. Drizzle interpolates a **column** reference
 * inside a raw `sql` template as a bare, unqualified name — `${user.id}` becomes
 * `"id"`, not `"user"."id"`. In a subquery that joins two tables which both have
 * an `id`, the correlation then silently binds to the wrong one: the join
 * matches nothing, `json_agg` returns null, and every user appears to have no
 * roles. It fails as empty data, not as an error. Interpolating the *table*
 * (`${userRoles}`) is safe — only columns are rendered unqualified — so tables
 * come from Drizzle and columns are spelled out against explicit aliases.
 */
const rolesJson = sql<{ id: string; name: string; slug: string }[]>`
  coalesce(
    (
      select json_agg(json_build_object('id', r.id, 'name', r.name, 'slug', r.slug))
      from ${userRoles} ur
      inner join ${roles} r on r.id = ur.role_id
      where ur.user_id = ${user}."id" and r.deleted_at is null
    ),
    '[]'::json
  )
`;

const SORT_COLUMNS = {
  name: user.name,
  email: user.email,
  jobTitle: user.jobTitle,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
} as const;

export interface ListUsersQuery extends PaginationParams {
  search?: string;
  sort?: { field: UserSortField; direction: SortDirection };
  /** `invited` is handled separately — invitations are not user rows. */
  statuses?: UserStatusFilter[];
}

/**
 * A page of users in a company.
 *
 * Paging, sorting, filtering, and counting all happen in SQL. The DataTable runs
 * in manual mode precisely so this stays true — fetching every row and slicing
 * in JavaScript works until a company has 5,000 people.
 */
export async function listUsers(
  companyId: string,
  query: ListUsersQuery,
): Promise<PaginatedResult<UserListItem>> {
  const filters: SQL[] = [liveUser(companyId)];

  if (query.search) {
    // Escape LIKE metacharacters: a search for "100%" must not match everything.
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    filters.push(or(ilike(user.name, term), ilike(user.email, term), ilike(user.jobTitle, term)) as SQL);
  }

  // Both statuses selected is the same as no filter; neither is unreachable.
  const wantsActive = query.statuses?.includes('active') ?? false;
  const wantsInactive = query.statuses?.includes('inactive') ?? false;

  if (wantsActive !== wantsInactive) {
    filters.push(eq(user.isActive, wantsActive));
  }

  const where = and(...filters);

  const sortColumn = SORT_COLUMNS[query.sort?.field ?? 'name'];
  const direction = query.sort?.direction === 'desc' ? desc : asc;

  const [items, [total]] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        jobTitle: user.jobTitle,
        phone: user.phone,
        isActive: user.isActive,
        emailVerified: user.emailVerified,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        roles: rolesJson,
      })
      .from(user)
      .where(where)
      // A stable tiebreak on id: without it, two users with the same name can
      // swap places between pages and one of them is never shown.
      .orderBy(direction(sortColumn), asc(user.id))
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db.select({ value: count() }).from(user).where(where),
  ]);

  return buildPaginatedResult(items, total?.value ?? 0, query);
}

/** One user, scoped to the company. `null` when missing, deleted, or another tenant's. */
export async function findById(companyId: string, userId: string): Promise<UserRow | null> {
  const row = await db.query.user.findFirst({
    where: and(eq(user.id, userId), liveUser(companyId)),
  });

  return row ?? null;
}

export async function findByEmail(email: string): Promise<UserRow | null> {
  const row = await db.query.user.findFirst({
    where: and(eq(user.email, email), isNull(user.deletedAt)),
  });

  return row ?? null;
}

export async function update(
  companyId: string,
  userId: string,
  values: UpdateUserInput,
): Promise<UserRow | null> {
  const [updated] = await db
    .update(user)
    .set(values)
    .where(and(eq(user.id, userId), liveUser(companyId)))
    .returning();

  return updated ?? null;
}

export async function setActive(
  companyId: string,
  userId: string,
  isActive: boolean,
): Promise<UserRow | null> {
  const [updated] = await db
    .update(user)
    .set({ isActive })
    .where(and(eq(user.id, userId), liveUser(companyId)))
    .returning();

  return updated ?? null;
}

/**
 * Soft-delete a user and revoke their access in the same statement.
 *
 * `isActive: false` alongside `deletedAt` is not redundant: `getSession` gates
 * on `isActive`, so without it a soft-deleted user keeps working until their
 * cookie expires. Their records stay theirs — `deleted_at` on a person means the
 * account is gone, not the work.
 */
export async function softDelete(companyId: string, userId: string): Promise<UserRow | null> {
  const [deleted] = await db
    .update(user)
    .set({ deletedAt: new Date(), isActive: false })
    .where(and(eq(user.id, userId), liveUser(companyId)))
    .returning();

  return deleted ?? null;
}

/** Replace a user's roles wholesale, in one transaction. */
export async function setRoles(companyId: string, userId: string, roleIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(userRoles).where(eq(userRoles.userId, userId));

    if (roleIds.length === 0) return;

    // Re-resolve the ids against this company: a caller could otherwise post a
    // role id belonging to another tenant and grant it to their own user.
    const owned = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.companyId, companyId), inArray(roles.id, roleIds), isNull(roles.deletedAt)));

    if (owned.length === 0) return;

    await tx.insert(userRoles).values(owned.map((role) => ({ userId, roleId: role.id })));
  });
}

/** How many live, active users hold a given role slug. Used to protect the last owner. */
export async function countActiveUsersWithRoleSlug(companyId: string, slug: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .innerJoin(user, eq(user.id, userRoles.userId))
    .where(
      and(
        eq(roles.companyId, companyId),
        eq(roles.slug, slug),
        isNull(roles.deletedAt),
        eq(user.isActive, true),
        isNull(user.deletedAt),
      ),
    );

  return row?.value ?? 0;
}

export async function userHasRoleSlug(companyId: string, userId: string, slug: string): Promise<boolean> {
  const [row] = await db
    .select({ value: count() })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(roles.companyId, companyId),
        eq(roles.slug, slug),
        isNull(roles.deletedAt),
      ),
    );

  return (row?.value ?? 0) > 0;
}

// ---- Invitations ------------------------------------------------------------

export interface PendingInvitation {
  id: string;
  email: string;
  roleName: string;
  invitedByName: string | null;
  expiresAt: Date;
  createdAt: Date;
}

const pendingInvitation = (companyId: string) =>
  and(
    eq(invitations.companyId, companyId),
    isNull(invitations.acceptedAt),
    isNull(invitations.deletedAt),
  ) as SQL;

export async function listPendingInvitations(companyId: string): Promise<PendingInvitation[]> {
  const inviter = db.$with('inviter').as(db.select().from(user));

  return db
    .with(inviter)
    .select({
      id: invitations.id,
      email: invitations.email,
      roleName: roles.name,
      invitedByName: inviter.name,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .innerJoin(roles, eq(roles.id, invitations.roleId))
    .leftJoin(inviter, eq(inviter.id, invitations.invitedBy))
    .where(pendingInvitation(companyId))
    .orderBy(desc(invitations.createdAt));
}

export async function createInvitation(values: {
  companyId: string;
  email: string;
  roleId: string;
  tokenHash: string;
  invitedBy: string;
  expiresAt: Date;
}): Promise<InvitationRow> {
  const [row] = await db.insert(invitations).values(values).returning();

  if (!row) throw new Error('Invitation insert returned no row');

  return row;
}

/**
 * Resolve an invitation by its hashed token.
 *
 * Not scoped by company — the whole point is that the caller has no session yet.
 * The token is the credential, and it carries its own company.
 */
export async function findInvitationByTokenHash(tokenHash: string) {
  return db.query.invitations.findFirst({
    where: and(eq(invitations.tokenHash, tokenHash), isNull(invitations.deletedAt)),
    with: { company: true, role: true },
  });
}

export async function findPendingInvitationByEmail(
  companyId: string,
  email: string,
): Promise<InvitationRow | null> {
  const row = await db.query.invitations.findFirst({
    where: and(eq(invitations.email, email), pendingInvitation(companyId)),
  });

  return row ?? null;
}

/** Revoke a pending invitation. Soft delete, so the audit trail survives. */
export async function revokeInvitation(
  companyId: string,
  invitationId: string,
): Promise<InvitationRow | null> {
  const [row] = await db
    .update(invitations)
    .set({ deletedAt: new Date() })
    .where(and(eq(invitations.id, invitationId), pendingInvitation(companyId)))
    .returning();

  return row ?? null;
}

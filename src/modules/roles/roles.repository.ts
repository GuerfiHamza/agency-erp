import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '@/db';
import { permissions, rolePermissions, roles, user, userRoles } from '@/db/schema';

/**
 * Role data access. The only place in the module that touches Drizzle.
 *
 * Every query is scoped by `companyId`: roles are per-tenant, and a role from
 * another company must be invisible rather than merely un-grantable.
 *
 * Not marked `server-only`, matching `rbac.repository.ts` — the ESLint boundary
 * already stops UI importing `@/db`, and scripts need this layer.
 */

export type RoleRow = typeof roles.$inferSelect;

export interface RoleListItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  /** Live, non-deleted members holding this role. */
  userCount: number;
  permissionCount: number;
}

const liveRole = (companyId: string) => and(eq(roles.companyId, companyId), isNull(roles.deletedAt));

/**
 * Every role in a company, with its member and permission counts.
 *
 * Counted in SQL as correlated subqueries rather than by loading the join rows:
 * the page only needs the numbers, and the alternative is two more queries per
 * role. The aliases are deliberate — Drizzle renders a column inside a raw `sql`
 * template unqualified (`${roles.id}` → `"id"`), so an unaliased correlation
 * would silently bind to the wrong table's id and count the wrong thing.
 */
export async function listRoles(companyId: string): Promise<RoleListItem[]> {
  return (
    db
      .select({
        id: roles.id,
        name: roles.name,
        slug: roles.slug,
        description: roles.description,
        isSystem: roles.isSystem,
        userCount: sql<number>`(
        select count(*)::int
        from ${userRoles} ur
        inner join ${user} u on u.id = ur.user_id
        where ur.role_id = ${roles}."id" and u.deleted_at is null
      )`,
        permissionCount: sql<number>`(
        select count(*)::int
        from ${rolePermissions} rp
        where rp.role_id = ${roles}."id"
      )`,
      })
      .from(roles)
      .where(liveRole(companyId))
      // System roles first, then alphabetical: owner/admin/manager/member are the
      // ones people look for, and burying them under custom roles is unhelpful.
      .orderBy(sql`${roles.isSystem} desc`, asc(roles.name))
  );
}

/** One role with its granted permission slugs. `null` when missing or another tenant's. */
export async function findById(companyId: string, roleId: string) {
  const role = await db.query.roles.findFirst({
    where: and(eq(roles.id, roleId), liveRole(companyId)),
  });

  if (!role) return null;

  const granted = await db
    .select({ slug: permissions.slug })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, roleId));

  return { ...role, permissionSlugs: granted.map((row) => row.slug) };
}

export async function isSlugTaken(companyId: string, slug: string): Promise<boolean> {
  const existing = await db.query.roles.findFirst({
    where: and(eq(roles.slug, slug), liveRole(companyId)),
    columns: { id: true },
  });

  return Boolean(existing);
}

/**
 * Create a custom role and its grants in one transaction.
 *
 * A role that exists with none of its intended permissions is worse than no
 * role: it can be assigned, and it silently grants nothing.
 */
export async function create(values: {
  companyId: string;
  name: string;
  slug: string;
  description: string | null;
  permissionSlugs: string[];
}): Promise<RoleRow> {
  return db.transaction(async (tx) => {
    const [role] = await tx
      .insert(roles)
      .values({
        companyId: values.companyId,
        name: values.name,
        slug: values.slug,
        description: values.description,
        // Only provisioning creates system roles. Anything made here is custom
        // and therefore editable and deletable.
        isSystem: false,
      })
      .returning();

    if (!role) throw new Error('Role insert returned no row');

    await replaceGrants(tx, role.id, values.permissionSlugs);

    return role;
  });
}

export async function update(
  companyId: string,
  roleId: string,
  values: { name: string; description: string | null; permissionSlugs: string[] },
): Promise<RoleRow | null> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(roles)
      .set({ name: values.name, description: values.description })
      .where(and(eq(roles.id, roleId), eq(roles.companyId, companyId), isNull(roles.deletedAt)))
      .returning();

    if (!updated) return null;

    await replaceGrants(tx, roleId, values.permissionSlugs);

    return updated;
  });
}

/**
 * Replace a role's grants wholesale.
 *
 * Slugs are resolved against the catalogue here, so an unknown slug grants
 * nothing rather than failing the whole transaction — the schema already
 * rejected unknown slugs, and this is the second line of defence.
 */
async function replaceGrants(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  roleId: string,
  permissionSlugs: string[],
): Promise<void> {
  await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));

  if (permissionSlugs.length === 0) return;

  const resolved = await tx
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.slug, permissionSlugs));

  if (resolved.length === 0) return;

  await tx.insert(rolePermissions).values(resolved.map((row) => ({ roleId, permissionId: row.id })));
}

/** How many live users hold this role. */
export async function countUsers(companyId: string, roleId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .innerJoin(user, eq(user.id, userRoles.userId))
    .where(and(eq(userRoles.roleId, roleId), eq(roles.companyId, companyId), isNull(user.deletedAt)));

  return row?.value ?? 0;
}

/**
 * Soft-delete a role.
 *
 * Soft rather than hard: `user_roles.role_id` cascades, so a hard delete would
 * silently strip the role from everyone holding it and leave no trace of what
 * they used to have. `findPermissionSlugsByUserId` already excludes deleted
 * roles, so the grant stops taking effect either way — this keeps the history.
 */
export async function softDelete(companyId: string, roleId: string): Promise<RoleRow | null> {
  const [deleted] = await db
    .update(roles)
    .set({ deletedAt: new Date() })
    .where(and(eq(roles.id, roleId), eq(roles.companyId, companyId), isNull(roles.deletedAt)))
    .returning();

  return deleted ?? null;
}

/** The full catalogue, for the permission picker. Global, not per-tenant. */
export async function listPermissionCatalogue() {
  return db
    .select({
      id: permissions.id,
      slug: permissions.slug,
      resource: permissions.resource,
      action: permissions.action,
      description: permissions.description,
    })
    .from(permissions)
    .orderBy(asc(permissions.resource), asc(permissions.action));
}

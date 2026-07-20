import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { permissions, rolePermissions, roles, userRoles } from '@/db/schema';

/**
 * RBAC data access. The only place in the module that touches Drizzle.
 *
 * Deliberately not marked `server-only`: that marker throws outside React's
 * react-server condition, and the seeder (a plain tsx script) provisions roles
 * through this file. Server-component-only helpers live in `rbac.service.ts`.
 * The ESLint boundary already stops UI from importing `@/db`.
 *
 * Phase 5 adds role CRUD here; Phase 3 needs reads and role assignment only.
 */

export interface UserRoleSummary {
  roleId: string;
  slug: string;
  name: string;
  companyId: string;
}

/**
 * Every permission slug granted to a user, across all their roles.
 *
 * One join rather than a query per role: this runs on effectively every
 * authenticated request, so N+1 here would be felt everywhere.
 *
 * Soft-deleted roles are excluded — revoking a role must actually revoke it.
 */
export async function findPermissionSlugsByUserId(userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ slug: permissions.slug })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(and(eq(userRoles.userId, userId), isNull(roles.deletedAt)));

  return rows.map((row) => row.slug);
}

/** The roles a user holds. Used for display and for system-role checks. */
export async function findRolesByUserId(userId: string): Promise<UserRoleSummary[]> {
  return db
    .select({
      roleId: roles.id,
      slug: roles.slug,
      name: roles.name,
      companyId: roles.companyId,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(userRoles.userId, userId), isNull(roles.deletedAt)));
}

/** Resolve a role by its slug within a company. */
export async function findRoleBySlug(companyId: string, slug: string) {
  return db.query.roles.findFirst({
    where: and(eq(roles.companyId, companyId), eq(roles.slug, slug), isNull(roles.deletedAt)),
  });
}

/**
 * Every live role in a company, for pickers and role management.
 *
 * Ordered by name so the list is stable between renders; the seeded system
 * roles and any custom ones are returned together, because to someone assigning
 * a role the distinction is invisible.
 */
export async function listRolesForCompany(companyId: string) {
  return db
    .select({
      id: roles.id,
      name: roles.name,
      slug: roles.slug,
      description: roles.description,
      isSystem: roles.isSystem,
    })
    .from(roles)
    .where(and(eq(roles.companyId, companyId), isNull(roles.deletedAt)))
    .orderBy(asc(roles.name));
}

export async function assignRoleToUser(userId: string, roleId: string, assignedBy?: string): Promise<void> {
  // Re-assigning an existing role is a no-op, not an error.
  await db.insert(userRoles).values({ userId, roleId, assignedBy }).onConflictDoNothing();
}

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { PERMISSIONS, SYSTEM_ROLES } from '@/config/permissions';
import { db } from '@/db';
import { permissions, rolePermissions, roles } from '@/db/schema';

/**
 * Role and permission provisioning.
 *
 * Shared by two callers that must not drift: the seeder (`npm run db:seed`) and
 * registration, which provisions a brand-new company's roles the moment it is
 * created. If these were written twice, a company created through sign-up would
 * quietly get different permissions from a seeded one.
 *
 * Not marked `server-only` — the seeder is a plain script, and that marker
 * throws outside React's react-server condition.
 *
 * Every function here is idempotent.
 */

/** Upsert the global permission catalogue from `config/permissions.ts`. */
export async function syncPermissionCatalogue(): Promise<number> {
  await db
    .insert(permissions)
    .values(PERMISSIONS)
    .onConflictDoUpdate({
      target: permissions.slug,
      // `excluded` is the row the failed insert proposed.
      set: { description: sql`excluded.description` },
    });

  return PERMISSIONS.length;
}

export interface ProvisionedRole {
  slug: string;
  roleId: string;
  granted: number;
  revoked: number;
}

/**
 * Create (or reconcile) the system roles for a company.
 *
 * Reconciles rather than only inserting: tightening a role in
 * `config/permissions.ts` must actually revoke the removed grants, otherwise the
 * code would claim a restriction the database does not enforce.
 */
export async function provisionSystemRoles(companyId: string): Promise<ProvisionedRole[]> {
  const catalogue = await db.select({ id: permissions.id, slug: permissions.slug }).from(permissions);
  const idBySlug = new Map(catalogue.map((row) => [row.slug, row.id]));

  const results: ProvisionedRole[] = [];

  for (const definition of SYSTEM_ROLES) {
    const existing = await db.query.roles.findFirst({
      where: and(eq(roles.companyId, companyId), eq(roles.slug, definition.slug), isNull(roles.deletedAt)),
    });

    const roleId =
      existing?.id ??
      (
        await db
          .insert(roles)
          .values({
            companyId,
            slug: definition.slug,
            name: definition.name,
            description: definition.description,
            isSystem: true,
          })
          .returning({ id: roles.id })
      )[0]!.id;

    // `null` means "every permission", resolved now so owners automatically
    // gain permissions added since the last run.
    const slugs = definition.permissions ?? catalogue.map((row) => row.slug);
    const desired = slugs.map((slug) => idBySlug.get(slug)).filter((id): id is string => id !== undefined);

    if (desired.length > 0) {
      await db
        .insert(rolePermissions)
        .values(desired.map((permissionId) => ({ roleId, permissionId })))
        .onConflictDoNothing();
    }

    const desiredSet = new Set(desired);
    const current = await db
      .select({ permissionId: rolePermissions.permissionId })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));

    const stale = current.map((row) => row.permissionId).filter((id) => !desiredSet.has(id));

    if (stale.length > 0) {
      await db
        .delete(rolePermissions)
        .where(and(eq(rolePermissions.roleId, roleId), inArray(rolePermissions.permissionId, stale)));
    }

    results.push({ slug: definition.slug, roleId, granted: desired.length, revoked: stale.length });
  }

  return results;
}

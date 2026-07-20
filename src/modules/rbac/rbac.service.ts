import 'server-only';

import { cache } from 'react';

import type { PermissionSlug } from '@/config/permissions';

import * as repository from './rbac.repository';

/**
 * Authorization rules.
 *
 * A user's effective permissions are the union of every permission across every
 * role they hold. There is no deny list: a permission is granted or it is
 * absent. Denies interact badly with role unions — "admin but not delete" is a
 * separate role, not a subtraction.
 */

/**
 * Permission set for a user, memoized for the current request.
 *
 * React's `cache` dedupes this per render pass, so a page that checks five
 * permissions across five components still issues one query. The cache does not
 * outlive the request, so a role change takes effect on the next navigation
 * rather than lingering.
 */
export const getUserPermissions = cache(async (userId: string): Promise<ReadonlySet<string>> => {
  const slugs = await repository.findPermissionSlugsByUserId(userId);
  return new Set(slugs);
});

export const getUserRoles = cache(async (userId: string) => repository.findRolesByUserId(userId));

/** Whether a user holds a permission. */
export async function userHasPermission(userId: string, permission: PermissionSlug): Promise<boolean> {
  const granted = await getUserPermissions(userId);
  return granted.has(permission);
}

/** Whether a user holds every listed permission. */
export async function userHasAllPermissions(
  userId: string,
  required: readonly PermissionSlug[],
): Promise<boolean> {
  const granted = await getUserPermissions(userId);
  return required.every((permission) => granted.has(permission));
}

/** Whether a user holds at least one of the listed permissions. */
export async function userHasAnyPermission(
  userId: string,
  required: readonly PermissionSlug[],
): Promise<boolean> {
  const granted = await getUserPermissions(userId);
  return required.some((permission) => granted.has(permission));
}

export async function assignRole(userId: string, roleId: string, assignedBy?: string): Promise<void> {
  await repository.assignRoleToUser(userId, roleId, assignedBy);
}

export async function findRoleBySlug(companyId: string, slug: string) {
  return repository.findRoleBySlug(companyId, slug);
}

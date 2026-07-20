import 'server-only';

import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { findAvailableSlug, toSlug } from '@/lib/slug';

import * as repository from './roles.repository';
import type { CreateRoleInput, UpdateRoleInput } from './roles.validation';

/**
 * Role rules.
 *
 * Two protections live here, and both exist to stop a company quietly losing
 * access it thinks it has: system roles are immutable, and a role still held by
 * someone cannot be deleted out from under them.
 */

export type { RoleListItem } from './roles.repository';

export async function listRoles(companyId: string) {
  return repository.listRoles(companyId);
}

export async function listPermissionCatalogue() {
  return repository.listPermissionCatalogue();
}

export async function getRole(companyId: string, roleId: string) {
  const role = await repository.findById(companyId, roleId);

  if (!role) throw new NotFoundError('Role not found.');

  return role;
}

/**
 * System roles are read-only. Not merely undeletable — **unmodifiable**.
 *
 * `provisionSystemRoles` reconciles a company's system roles against
 * `config/permissions.ts`, revoking anything not in the catalogue definition. So
 * an edit made here would be reverted the next time provisioning runs, with no
 * warning and no record. A control that silently un-does itself is worse than no
 * control, hence the refusal rather than a best-effort write.
 *
 * The way to get a variant of `admin` is to copy it into a custom role.
 */
function assertNotSystemRole(role: { isSystem: boolean; name: string }, action: string): void {
  if (role.isSystem) {
    throw new ValidationError(
      `${role.name} is a built-in role and cannot be ${action}. Duplicate it into a custom role instead.`,
    );
  }
}

export async function createRole(companyId: string, input: CreateRoleInput) {
  const slug = await findAvailableSlug(toSlug(input.name, 'role'), (candidate) =>
    repository.isSlugTaken(companyId, candidate),
  );

  const role = await repository.create({
    companyId,
    name: input.name,
    slug,
    description: input.description,
    permissionSlugs: input.permissionSlugs,
  });

  logger.info('Role created', {
    companyId,
    roleId: role.id,
    slug,
    permissions: input.permissionSlugs.length,
  });

  return role;
}

export async function updateRole(companyId: string, input: UpdateRoleInput) {
  const existing = await getRole(companyId, input.roleId);

  assertNotSystemRole(existing, 'edited');

  const updated = await repository.update(companyId, input.roleId, {
    name: input.name,
    description: input.description,
    permissionSlugs: input.permissionSlugs,
  });

  if (!updated) throw new NotFoundError('Role not found.');

  logger.info('Role updated', {
    companyId,
    roleId: input.roleId,
    permissions: input.permissionSlugs.length,
  });

  return updated;
}

/**
 * Delete a custom role.
 *
 * Refused while anyone still holds it. The alternative is a silent demotion:
 * `user_roles` cascades on a hard delete, and the permission lookup already
 * skips deleted roles, so the holders would simply find themselves unable to do
 * their jobs with nothing on screen explaining why. Making the caller reassign
 * first turns that into a decision rather than a surprise.
 */
export async function deleteRole(companyId: string, roleId: string) {
  const existing = await getRole(companyId, roleId);

  assertNotSystemRole(existing, 'deleted');

  const holders = await repository.countUsers(companyId, roleId);

  if (holders > 0) {
    throw new ConflictError(
      holders === 1
        ? 'One person still has this role. Change their role before deleting it.'
        : `${holders} people still have this role. Change their roles before deleting it.`,
    );
  }

  const deleted = await repository.softDelete(companyId, roleId);

  if (!deleted) throw new NotFoundError('Role not found.');

  logger.info('Role deleted', { companyId, roleId, slug: deleted.slug });

  return deleted;
}

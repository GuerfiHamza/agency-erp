'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { err, ok, type Result } from '@/types';

import * as service from './roles.service';
import { createRoleSchema, updateRoleSchema } from './roles.validation';

/**
 * Role Server Actions.
 *
 * These grant authority, so they are the actions most worth attacking: each
 * re-establishes the session, re-checks its permission, and re-validates its
 * input against the permission catalogue. The company always comes from the
 * session — a `companyId` in the payload would let anyone rewrite another
 * tenant's roles.
 */

const ROLES_PATH = '/dashboard/settings/roles';
const USERS_PATH = '/dashboard/settings/users';

/** Role changes alter what the people list shows, so both pages go stale. */
function revalidateRolePages(): void {
  revalidatePath(ROLES_PATH);
  revalidatePath(USERS_PATH);
}

export async function createRoleAction(input: unknown): Promise<Result<{ roleId: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('roles:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = createRoleSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const role = await service.createRole(companyId, parsed.data);
    revalidateRolePages();

    return ok({ roleId: role.id });
  } catch (error) {
    logger.error('Failed to create role', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function updateRoleAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('roles:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = updateRoleSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.updateRole(companyId, parsed.data);
    revalidateRolePages();

    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update role', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deleteRoleAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('roles:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = z.object({ roleId: z.uuid() }).safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deleteRole(companyId, parsed.data.roleId);
    revalidateRolePages();

    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete role', { error, companyId });
    return err(toErrorPayload(error));
  }
}

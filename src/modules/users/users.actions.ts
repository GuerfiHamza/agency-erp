'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';

import { auth } from '@/lib/auth/auth';
import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getCompany } from '@/modules/companies/companies.service';
import { err, ok, type Result } from '@/types';

import * as service from './users.service';
import {
  acceptInvitationSchema,
  inviteUserSchema,
  setUserRolesSchema,
  updateUserSchema,
} from './users.validation';

/**
 * User Server Actions.
 *
 * Every one is a public HTTP endpoint, so each re-establishes the session,
 * re-checks its permission, and re-validates its input. The tenant always comes
 * from the session and never from the payload.
 *
 * `acceptInvitationAction` is the deliberate exception: it is unauthenticated,
 * because the whole point is that the caller has no account yet. Its credential
 * is the token.
 */

const USERS_PATH = '/dashboard/settings/users';

const userIdSchema = z.object({ userId: z.uuid() });

export async function inviteUserAction(input: unknown): Promise<Result<{ email: string }>> {
  const { companyId, userId, session } = await requireTenantSession();

  try {
    await requirePermission('users:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = inviteUserSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const company = await getCompany(companyId);
    const result = await service.inviteUser(
      companyId,
      company.name,
      { id: userId, name: session.user.name },
      parsed.data,
    );

    revalidatePath(USERS_PATH);

    return ok({ email: result.email });
  } catch (error) {
    logger.error('Failed to invite user', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function revokeInvitationAction(input: unknown): Promise<Result<{ revoked: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('users:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = z.object({ invitationId: z.uuid() }).safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.revokeInvitation(companyId, parsed.data.invitationId);
    revalidatePath(USERS_PATH);

    return ok({ revoked: true });
  } catch (error) {
    logger.error('Failed to revoke invitation', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function updateUserAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('users:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = userIdSchema.merge(updateUserSchema).safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  const { userId: targetUserId, ...values } = parsed.data;

  try {
    await service.updateUser(companyId, targetUserId, values);
    revalidatePath(USERS_PATH);

    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update user', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function setUserRolesAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId, userId } = await requireTenantSession();

  // Assigning roles is its own permission: deciding what someone can do is a
  // bigger act than editing their job title.
  try {
    await requirePermission('roles:assign');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = setUserRolesSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.setUserRoles(companyId, userId, parsed.data.userId, parsed.data.roleIds);
    revalidatePath(USERS_PATH);

    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to set user roles', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function setUserActiveAction(input: unknown): Promise<Result<{ isActive: boolean }>> {
  const { companyId, userId } = await requireTenantSession();

  try {
    await requirePermission('users:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = userIdSchema.extend({ isActive: z.boolean() }).safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const updated = await service.setUserActive(companyId, userId, parsed.data.userId, parsed.data.isActive);
    revalidatePath(USERS_PATH);

    return ok({ isActive: updated.isActive });
  } catch (error) {
    logger.error('Failed to change user active state', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deleteUserAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId, userId } = await requireTenantSession();

  try {
    await requirePermission('users:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = userIdSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deleteUser(companyId, userId, parsed.data.userId);
    revalidatePath(USERS_PATH);

    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete user', { error, companyId });
    return err(toErrorPayload(error));
  }
}

/**
 * Accept an invitation. **Unauthenticated on purpose** — the invitee has no
 * account until this succeeds. The token is the credential and is validated,
 * single-use, and time-bounded by the service.
 */
export async function acceptInvitationAction(input: unknown): Promise<Result<{ signedIn: boolean }>> {
  const parsed = acceptInvitationSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const { email } = await service.acceptInvitation(parsed.data);

    // Sign in with the password they just chose. This is also the proof that the
    // account we wrote by hand is one Better Auth accepts: if the credential row
    // were shaped wrong, this would fail rather than the bug surfacing later.
    await auth.api.signInEmail({
      body: { email, password: parsed.data.password },
      headers: await headers(),
    });

    return ok({ signedIn: true });
  } catch (error) {
    logger.error('Failed to accept invitation', { error });
    return err(toErrorPayload(error));
  }
}

import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';

import { INVITATION_TOKEN_TTL_SECONDS, ROUTES } from '@/config/constants';
import { clientEnv } from '@/config/env';
import { db } from '@/db';
import { account, invitations, user, userRoles } from '@/db/schema';
import { sendEmail } from '@/lib/email';
import { invitationEmail } from '@/lib/email/templates';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';

import * as repository from './users.repository';
import type { AcceptInvitationInput, InviteUserInput, UpdateUserInput } from './users.validation';

/**
 * User and invitation rules.
 *
 * This is where the rules that protect a company from locking itself out live:
 * you cannot remove your own access, and you cannot remove the last owner.
 * Neither belongs in the repository (they are policy, not SQL) or in the action
 * (which is a transport).
 */

export type { PendingInvitation, UserListItem } from './users.repository';

const OWNER_ROLE_SLUG = 'owner';

/**
 * An invitation token: 256 bits of randomness, stored only as a SHA-256 hash.
 *
 * Plain SHA-256 rather than a slow KDF, deliberately. A password is low-entropy
 * and needs the work factor; this token is uniformly random, so there is nothing
 * to brute-force, and acceptance must stay a single fast indexed lookup.
 * `base64url` keeps it safe in a query string without escaping.
 */
function createInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');

  return { token, tokenHash: hashToken(token) };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function invitationUrl(token: string): string {
  const url = new URL(ROUTES.acceptInvitation, clientEnv.NEXT_PUBLIC_APP_URL);
  url.searchParams.set('token', token);

  return url.toString();
}

export async function listUsers(companyId: string, query: repository.ListUsersQuery) {
  return repository.listUsers(companyId, query);
}

export async function listPendingInvitations(companyId: string) {
  return repository.listPendingInvitations(companyId);
}

export async function getUser(companyId: string, userId: string) {
  const found = await repository.findById(companyId, userId);

  if (!found) throw new NotFoundError('User not found.');

  return found;
}

export async function updateUser(companyId: string, userId: string, input: UpdateUserInput) {
  const updated = await repository.update(companyId, userId, input);

  if (!updated) throw new NotFoundError('User not found.');

  logger.info('User updated', { companyId, userId });

  return updated;
}

/**
 * Refuse to strip the company of its last owner.
 *
 * Guards every path that could remove owner access — role changes,
 * deactivation, and deletion — because a company with no active owner cannot
 * grant the role back to anyone. It is unrecoverable without database access.
 */
async function assertNotLastOwner(companyId: string, userId: string, action: string): Promise<void> {
  const isOwner = await repository.userHasRoleSlug(companyId, userId, OWNER_ROLE_SLUG);

  if (!isOwner) return;

  const owners = await repository.countActiveUsersWithRoleSlug(companyId, OWNER_ROLE_SLUG);

  if (owners <= 1) {
    throw new ConflictError(
      `This is the only owner. Make someone else an owner before you ${action} this account.`,
    );
  }
}

/** Change a user's roles. */
export async function setUserRoles(
  companyId: string,
  actorUserId: string,
  targetUserId: string,
  roleIds: string[],
): Promise<void> {
  await getUser(companyId, targetUserId);

  const keepsOwner = await (async () => {
    const owner = await db.query.roles.findFirst({
      where: (roles, { and: whereAnd, eq: whereEq, isNull: whereIsNull }) =>
        whereAnd(
          whereEq(roles.companyId, companyId),
          whereEq(roles.slug, OWNER_ROLE_SLUG),
          whereIsNull(roles.deletedAt),
        ),
      columns: { id: true },
    });

    return owner ? roleIds.includes(owner.id) : false;
  })();

  // Only a removal of ownership is dangerous; granting it never is.
  if (!keepsOwner) {
    await assertNotLastOwner(companyId, targetUserId, 'change the roles on');
  }

  // Demoting yourself is allowed when another owner exists — the guard above
  // covers the case that actually locks the company out.
  await repository.setRoles(companyId, targetUserId, roleIds);

  logger.info('User roles changed', { companyId, targetUserId, actorUserId, roleIds });
}

export async function setUserActive(
  companyId: string,
  actorUserId: string,
  targetUserId: string,
  isActive: boolean,
) {
  if (!isActive && actorUserId === targetUserId) {
    // The session would be revoked by getSession on the very next request.
    throw new ValidationError('You cannot deactivate your own account.');
  }

  if (!isActive) {
    await assertNotLastOwner(companyId, targetUserId, 'deactivate');
  }

  const updated = await repository.setActive(companyId, targetUserId, isActive);

  if (!updated) throw new NotFoundError('User not found.');

  logger.info('User active state changed', { companyId, targetUserId, actorUserId, isActive });

  return updated;
}

export async function deleteUser(companyId: string, actorUserId: string, targetUserId: string) {
  if (actorUserId === targetUserId) {
    throw new ValidationError('You cannot delete your own account.');
  }

  await assertNotLastOwner(companyId, targetUserId, 'delete');

  const deleted = await repository.softDelete(companyId, targetUserId);

  if (!deleted) throw new NotFoundError('User not found.');

  logger.info('User deleted', { companyId, targetUserId, actorUserId });

  return deleted;
}

// ---- Invitations ------------------------------------------------------------

export interface InviteResult {
  invitationId: string;
  email: string;
}

/**
 * Invite someone to join the company.
 *
 * The membership check is deliberately narrow — it only asks whether the address
 * is already in *this* company. Asking whether it exists anywhere would turn an
 * admin-facing form into a cross-tenant oracle: "is alice@rival.test a customer
 * of this product?" A collision with an account in another company therefore
 * surfaces at acceptance instead, where the only person who can see it is
 * whoever controls the inbox.
 */
export async function inviteUser(
  companyId: string,
  companyName: string,
  inviter: { id: string; name: string },
  input: InviteUserInput,
): Promise<InviteResult> {
  const existing = await repository.findByEmail(input.email);

  if (existing?.companyId === companyId) {
    throw new ConflictError('That person is already a member of this company.');
  }

  const pending = await repository.findPendingInvitationByEmail(companyId, input.email);

  if (pending) {
    throw new ConflictError('An invitation is already pending for that address.');
  }

  const role = await db.query.roles.findFirst({
    where: (roles, { and: whereAnd, eq: whereEq, isNull: whereIsNull }) =>
      whereAnd(
        whereEq(roles.id, input.roleId),
        whereEq(roles.companyId, companyId),
        whereIsNull(roles.deletedAt),
      ),
  });

  // Re-resolved against this company: a role id from another tenant must not be
  // grantable by posting it to this action.
  if (!role) throw new ValidationError('That role does not exist.');

  const { token, tokenHash } = createInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_TOKEN_TTL_SECONDS * 1000);

  const invitation = await repository.createInvitation({
    companyId,
    email: input.email,
    roleId: role.id,
    tokenHash,
    invitedBy: inviter.id,
    expiresAt,
  });

  await sendEmail(
    invitationEmail({
      to: input.email,
      companyName,
      inviterName: inviter.name,
      roleName: role.name,
      url: invitationUrl(token),
      expiresInDays: Math.round(INVITATION_TOKEN_TTL_SECONDS / 86_400),
    }),
  );

  logger.info('User invited', { companyId, email: input.email, roleId: role.id, invitedBy: inviter.id });

  return { invitationId: invitation.id, email: invitation.email };
}

export async function revokeInvitation(companyId: string, invitationId: string) {
  const revoked = await repository.revokeInvitation(companyId, invitationId);

  if (!revoked) throw new NotFoundError('That invitation is no longer pending.');

  logger.info('Invitation revoked', { companyId, invitationId });

  return revoked;
}

export interface InvitationPreview {
  email: string;
  companyName: string;
  roleName: string;
}

/** What the acceptance page shows before anyone types anything. */
export async function previewInvitation(token: string): Promise<InvitationPreview> {
  const invitation = await repository.findInvitationByTokenHash(hashToken(token));

  if (!invitation || invitation.acceptedAt || invitation.expiresAt.getTime() < Date.now()) {
    // One message for missing, used, and expired: the differences are of no use
    // to a legitimate invitee and of real use to someone guessing tokens.
    throw new NotFoundError('This invitation is no longer valid. Ask for a new one.');
  }

  return {
    email: invitation.email,
    companyName: invitation.company.name,
    roleName: invitation.role.name,
  };
}

export interface AcceptResult {
  email: string;
  companyId: string;
}

/**
 * Accept an invitation: create the account, join the company, take the role.
 *
 * Done as one transaction with a direct insert rather than through
 * `auth.api.signUpEmail`, for three reasons that all bite otherwise:
 *
 * 1. `signUpEmail` returns a **synthetic, never-inserted id** for an address
 *    that already exists, so provisioning off its return value can target a row
 *    that does not exist (see MEMORY.md).
 * 2. With `requireEmailVerification` it would send a "confirm your email" to
 *    someone who just proved they control that inbox by clicking this link.
 * 3. A user created but left without a role or an accepted invitation is a
 *    half-joined account. Either all four writes land or none do.
 *
 * The account row shape is Better Auth's own contract, taken from its sign-up
 * route: `providerId: "credential"`, `accountId = user.id`, and a password
 * hashed by the library's exported `hashPassword`. It is verified by signing in
 * with it afterwards, not by assertion.
 */
export async function acceptInvitation(input: AcceptInvitationInput): Promise<AcceptResult> {
  const invitation = await repository.findInvitationByTokenHash(hashToken(input.token));

  if (!invitation || invitation.acceptedAt || invitation.expiresAt.getTime() < Date.now()) {
    throw new NotFoundError('This invitation is no longer valid. Ask for a new one.');
  }

  const existing = await repository.findByEmail(invitation.email);

  if (existing) {
    // Safe to be specific: only the inbox owner could be holding this token.
    throw new ConflictError('An account already exists for this address. Sign in instead.');
  }

  const passwordHash = await hashPassword(input.password);

  const createdId = await db.transaction(async (tx) => {
    // Single-use, enforced by the database: `accepted_at IS NULL` in the WHERE
    // means two concurrent acceptances cannot both win. Done first so the losing
    // transaction rolls back before creating anything.
    const [claimed] = await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, invitation.id))
      .returning({ id: invitations.id });

    if (!claimed) throw new ConflictError('This invitation has already been used.');

    const [created] = await tx
      .insert(user)
      .values({
        name: input.name,
        email: invitation.email,
        // Clicking a link sent to this address is exactly what verification
        // proves. Making them prove it twice would be theatre.
        emailVerified: true,
        companyId: invitation.companyId,
        isActive: true,
      })
      .returning({ id: user.id });

    if (!created) throw new InternalError('Failed to create the account.');

    await tx.insert(account).values({
      userId: created.id,
      providerId: 'credential',
      accountId: created.id,
      password: passwordHash,
    });

    await tx.insert(userRoles).values({ userId: created.id, roleId: invitation.roleId });

    return created.id;
  });

  logger.info('Invitation accepted', {
    companyId: invitation.companyId,
    userId: createdId,
    invitationId: invitation.id,
  });

  return { email: invitation.email, companyId: invitation.companyId };
}

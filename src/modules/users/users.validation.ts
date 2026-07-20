import { z } from 'zod';

import { DB_LIMITS, PASSWORD } from '@/config/constants';

/**
 * User and invitation input schemas.
 *
 * Shared by the forms and the Server Actions. The client copy is for feedback;
 * the server copy is the one that is trusted.
 */

/**
 * Trim and lowercase **before** validating, via `.pipe`.
 *
 * `z.email().trim()` reads like it does this but does not: the chained transform
 * runs after the check, so a pasted " alex@example.com " is rejected as invalid
 * rather than cleaned up. Verified. Casing matters here beyond tidiness — the
 * pending-invitation uniqueness check compares stored values, so "Alex@" and
 * "alex@" would otherwise be two different invitations to one person.
 */
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email({ error: 'Enter a valid email address.' })
      .max(DB_LIMITS.shortText, { error: 'That email is too long.' }),
  );

const name = z
  .string()
  .trim()
  .min(2, { error: 'Enter a full name.' })
  .max(DB_LIMITS.shortText, { error: 'That name is too long.' });

const optionalText = (max: number = DB_LIMITS.shortText) =>
  z
    .string()
    .trim()
    .max(max, { error: `Keep this under ${max} characters.` })
    .transform((value) => value || null)
    .nullable();

/** Invite someone to the company. The role is chosen at invite time. */
export const inviteUserSchema = z.object({
  email,
  roleId: z.uuid({ error: 'Choose a role.' }),
});

export type InviteUserFormValues = z.input<typeof inviteUserSchema>;
export type InviteUserInput = z.output<typeof inviteUserSchema>;

/**
 * What an admin may change about someone else.
 *
 * Notably absent: `email` and `isActive`. Email is an auth identifier owned by
 * Better Auth and changing it silently would move the account someone signs in
 * with; deactivation is its own action because it is a security event, not a
 * profile edit.
 */
export const updateUserSchema = z.object({
  name,
  jobTitle: optionalText(),
  phone: optionalText(40),
});

export type UpdateUserFormValues = z.input<typeof updateUserSchema>;
export type UpdateUserInput = z.output<typeof updateUserSchema>;

/** Replace a user's roles. Empty is allowed — a user with no role can sign in and do nothing. */
export const setUserRolesSchema = z.object({
  userId: z.uuid(),
  roleIds: z.array(z.uuid()).max(20, { error: 'That is too many roles.' }),
});

export type SetUserRolesInput = z.output<typeof setUserRolesSchema>;

/**
 * Accepting an invitation.
 *
 * The invitee supplies their own name and password — the inviter never sets or
 * sees a credential. The token comes from the emailed link, not from the user.
 */
export const acceptInvitationSchema = z
  .object({
    token: z.string().min(1, { error: 'This invitation link is invalid.' }),
    name,
    password: z
      .string()
      .min(PASSWORD.minLength, { error: `Use at least ${PASSWORD.minLength} characters.` })
      .max(PASSWORD.maxLength, { error: 'That password is too long.' }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export type AcceptInvitationFormValues = z.input<typeof acceptInvitationSchema>;
export type AcceptInvitationInput = z.output<typeof acceptInvitationSchema>;

/** Columns the users table may be sorted by. Anything else is rejected, not ignored. */
export const USER_SORT_FIELDS = ['name', 'email', 'jobTitle', 'lastLoginAt', 'createdAt'] as const;

export type UserSortField = (typeof USER_SORT_FIELDS)[number];

export function isUserSortField(value: string | null): value is UserSortField {
  return value !== null && (USER_SORT_FIELDS as readonly string[]).includes(value);
}

/** Facet values for the status filter on the users table. */
export const USER_STATUS_FILTERS = ['active', 'inactive', 'invited'] as const;

export type UserStatusFilter = (typeof USER_STATUS_FILTERS)[number];

export function toUserStatusFilters(values: string[]): UserStatusFilter[] {
  return values.filter((value): value is UserStatusFilter =>
    (USER_STATUS_FILTERS as readonly string[]).includes(value),
  );
}

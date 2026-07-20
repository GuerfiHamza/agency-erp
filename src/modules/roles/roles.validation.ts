import { z } from 'zod';

import { DB_LIMITS } from '@/config/constants';
import { PERMISSION_SLUGS } from '@/config/permissions';

/**
 * Role input schemas.
 *
 * The permission list is validated against the catalogue rather than accepted as
 * free strings: a Server Action is a public endpoint, and an unrecognised slug
 * would either be silently dropped or stored as a grant that means nothing.
 */

const permissionSlugs = z
  .array(z.string())
  .max(PERMISSION_SLUGS.length, { error: 'That is more permissions than exist.' })
  .refine((slugs) => slugs.every((slug) => (PERMISSION_SLUGS as string[]).includes(slug)), {
    error: 'That permission does not exist.',
  })
  // Two grants of the same permission are one grant; the composite primary key
  // on role_permissions would reject the duplicate anyway.
  .transform((slugs) => [...new Set(slugs)]);

const name = z
  .string()
  .trim()
  .min(2, { error: 'Enter a role name.' })
  .max(DB_LIMITS.shortText, { error: 'That name is too long.' });

const description = z
  .string()
  .trim()
  .max(DB_LIMITS.mediumText, { error: 'That description is too long.' })
  .transform((value) => value || null)
  .nullable();

export const createRoleSchema = z.object({
  name,
  description,
  permissionSlugs,
});

export type CreateRoleFormValues = z.input<typeof createRoleSchema>;
export type CreateRoleInput = z.output<typeof createRoleSchema>;

/**
 * Update takes the same shape minus the slug, which is not editable.
 *
 * The slug is a stable machine key: `findRoleBySlug(companyId, 'owner')` and the
 * provisioning reconciler both address roles by it. Renaming the display name is
 * cosmetic; changing the slug would silently orphan those lookups.
 */
export const updateRoleSchema = createRoleSchema.extend({
  roleId: z.uuid(),
});

export type UpdateRoleFormValues = z.input<typeof updateRoleSchema>;
export type UpdateRoleInput = z.output<typeof updateRoleSchema>;

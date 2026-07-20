import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { companies, user } from '@/db/schema';
import { ConflictError, InternalError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { findAvailableSlug, toSlug } from '@/lib/slug';
import { provisionSystemRoles } from '@/modules/rbac/rbac.provisioning';
import * as rbac from '@/modules/rbac/rbac.repository';

/**
 * Registration and onboarding rules.
 *
 * Kept out of the Server Action so the logic is testable without a request, and
 * out of `lib/auth/auth.ts` so Better Auth stays a configured dependency rather
 * than a place business rules accumulate.
 */

/** Company slugs are unique across all live companies, not per tenant. */
async function isCompanySlugTaken(candidate: string): Promise<boolean> {
  const taken = await db.query.companies.findFirst({
    where: and(eq(companies.slug, candidate), isNull(companies.deletedAt)),
    columns: { id: true },
  });

  return Boolean(taken);
}

export interface OnboardResult {
  companyId: string;
  slug: string;
}

/**
 * Attach a newly registered user to a brand-new company as its owner.
 *
 * Runs in one transaction: a company without an owner is unreachable, and a
 * user pointed at a company whose roles were never provisioned can sign in but
 * do nothing. Either both happen or neither does.
 *
 * Separate from sign-up because Better Auth owns user creation. A user with
 * `companyId = null` is a real, recoverable state — they land on /onboarding.
 */
export async function onboardUserWithNewCompany(userId: string, companyName: string): Promise<OnboardResult> {
  const existing = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { id: true, companyId: true },
  });

  if (!existing) {
    throw new InternalError('User not found during onboarding.');
  }

  if (existing.companyId) {
    throw new ConflictError('This account already belongs to a company.');
  }

  const slug = await findAvailableSlug(toSlug(companyName, 'company'), isCompanySlugTaken);

  return db.transaction(async (tx) => {
    const [company] = await tx
      .insert(companies)
      .values({ name: companyName, slug, status: 'active' })
      .returning({ id: companies.id, slug: companies.slug });

    if (!company) {
      throw new InternalError('Failed to create company.');
    }

    // provisionSystemRoles and the rbac repository use the module-level `db`,
    // so they run outside this transaction. Accepted deliberately: both are
    // idempotent and re-runnable, and threading a tx through them would leak
    // transaction plumbing across every module boundary for a path that only
    // runs once per company. The failure mode is a company whose roles are
    // provisioned but whose owner link is rolled back — recoverable by retrying
    // onboarding, which is exactly what /onboarding does.
    await tx.update(user).set({ companyId: company.id }).where(eq(user.id, userId));

    return { companyId: company.id, slug: company.slug };
  });
}

/**
 * Provision a company's roles and make a user its owner.
 *
 * Called after `onboardUserWithNewCompany` succeeds.
 */
export async function grantOwnership(userId: string, companyId: string): Promise<void> {
  await provisionSystemRoles(companyId);

  const ownerRole = await rbac.findRoleBySlug(companyId, 'owner');

  if (!ownerRole) {
    throw new InternalError('Owner role missing after provisioning.');
  }

  await rbac.assignRoleToUser(userId, ownerRole.id);

  logger.info('Company provisioned', { companyId, userId });
}

/**
 * Full onboarding: create the company, provision roles, grant ownership.
 *
 * Ordering matters. The company row is created first so that if role
 * provisioning fails, the user is attached to a company and can retry; the
 * reverse would strand orphaned roles.
 */
export async function registerCompanyForUser(userId: string, companyName: string): Promise<OnboardResult> {
  const result = await onboardUserWithNewCompany(userId, companyName);
  await grantOwnership(userId, result.companyId);
  return result;
}

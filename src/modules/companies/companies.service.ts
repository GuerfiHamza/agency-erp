import 'server-only';

import { NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';

import * as repository from './companies.repository';
import type { UpdateCompanyInput } from './companies.validation';

/**
 * Company profile rules.
 *
 * Kept out of the Server Action so it is testable without a request, and out of
 * the repository so SQL stays free of policy.
 */

export type { Company } from './companies.repository';

/** The caller's own company. Throws `NotFoundError` when it is gone. */
export async function getCompany(companyId: string) {
  const company = await repository.findById(companyId);

  if (!company) {
    // Reachable in practice: a live session outlives a deleted company, so the
    // cookie is valid and points at nothing.
    throw new NotFoundError('Company not found.');
  }

  return company;
}

/**
 * Update the caller's company profile.
 *
 * `slug` is not updatable here, and that is a decision rather than an omission.
 * It identifies the tenant in URLs, so rewriting it on every rename would break
 * links that are already shared and bookmarked. Renaming is common; re-slugging
 * is a migration. When Phase 5's later modules need a vanity URL change, it
 * belongs behind its own action with a redirect from the old slug — not as a
 * side effect of typing in the name field.
 */
export async function updateCompany(companyId: string, input: UpdateCompanyInput) {
  const updated = await repository.update(companyId, input);

  if (!updated) {
    throw new NotFoundError('Company not found.');
  }

  logger.info('Company profile updated', { companyId });

  return updated;
}

/**
 * Close a company. Soft-deletes it and signs every member out for good.
 *
 * Deliberately irreversible from inside the product: the deletion deactivates
 * every user including the owner who asked for it, so nobody is left with an
 * account that could undo it. That is the honest consequence of deleting the
 * tenant root, and a self-service "restore" would only be a second way to get
 * the permission wrong. Recovery is a support operation against the database,
 * which the soft delete keeps possible.
 */
export async function deleteCompany(companyId: string) {
  const deleted = await repository.softDelete(companyId);

  if (!deleted) {
    throw new NotFoundError('Company not found.');
  }

  logger.warn('Company deleted', { companyId, slug: deleted.slug });

  return deleted;
}

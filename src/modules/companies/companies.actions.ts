'use server';

import { revalidatePath } from 'next/cache';

import { ROUTES } from '@/config/constants';
import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { err, ok, type Result } from '@/types';

import * as service from './companies.service';
import type { Company } from './companies.service';
import { updateCompanySchema } from './companies.validation';

/**
 * Company Server Actions.
 *
 * A Server Action is a public HTTP endpoint: anything reachable here is
 * reachable by anyone who can POST. So each one re-establishes the session,
 * re-checks the permission, and re-validates the input, no matter what the UI
 * already did — a disabled button protects nothing.
 *
 * There is no create action, by design. Companies are born at /onboarding, where
 * a real session proves a real user; the permission catalogue reflects that with
 * `companies:read | update | delete` and no `companies:create`.
 */

export async function updateCompanyAction(input: unknown): Promise<Result<Company>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('companies:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = updateCompanySchema.safeParse(input);

  if (!parsed.success) {
    return err(toErrorPayload(validationErrorFromZod(parsed.error)));
  }

  try {
    // The tenant comes from the session, never from the payload. Accepting a
    // companyId from the client would let any signed-in user rewrite any
    // company's profile by editing one field in the request.
    const company = await service.updateCompany(companyId, parsed.data);

    revalidatePath(COMPANY_SETTINGS_PATH);

    return ok(company);
  } catch (error) {
    logger.error('Failed to update company', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deleteCompanyAction(): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  // `companies:delete` is held only by the owner — admin is explicitly the
  // whole catalogue minus this one slug. See config/permissions.ts.
  try {
    await requirePermission('companies:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  try {
    await service.deleteCompany(companyId);

    // Everyone in the company, caller included, is now deactivated; the next
    // request through getSession has no session to revalidate.
    revalidatePath(ROUTES.dashboard);

    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete company', { error, companyId });
    return err(toErrorPayload(error));
  }
}

// A `'use server'` module may only export async functions — a re-exported
// constant is a build error, not a lint nit. Hence the local binding.
const COMPANY_SETTINGS_PATH = '/dashboard/settings/company';

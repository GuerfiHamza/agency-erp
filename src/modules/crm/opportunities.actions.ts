'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { err, ok, type Result } from '@/types';

import * as service from './opportunities.service';
import { opportunityFormSchema } from './opportunities.validation';

/**
 * Opportunity Server Actions. Each re-establishes the session, re-checks its
 * permission, and re-validates its input. The tenant comes from the session.
 */

const OPPORTUNITIES_PATH = '/dashboard/opportunities';

const idSchema = z.object({ opportunityId: z.uuid() });

export async function createOpportunityAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('opportunities:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = opportunityFormSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createOpportunity(companyId, parsed.data);
    revalidatePath(OPPORTUNITIES_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create opportunity', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function updateOpportunityAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('opportunities:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.merge(opportunityFormSchema).safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  const { opportunityId, ...values } = parsed.data;

  try {
    await service.updateOpportunity(companyId, opportunityId, values);
    revalidatePath(OPPORTUNITIES_PATH);

    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update opportunity', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deleteOpportunityAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('opportunities:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deleteOpportunity(companyId, parsed.data.opportunityId);
    revalidatePath(OPPORTUNITIES_PATH);

    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete opportunity', { error, companyId });
    return err(toErrorPayload(error));
  }
}

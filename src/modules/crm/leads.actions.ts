'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { err, ok, type Result } from '@/types';

import * as service from './leads.service';
import { leadFormSchema } from './leads.validation';

/**
 * Lead Server Actions. Each re-establishes the session, re-checks its
 * permission, and re-validates its input. The tenant comes from the session.
 */

const LEADS_PATH = '/dashboard/leads';

const leadIdSchema = z.object({ leadId: z.uuid() });

export async function createLeadAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('leads:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = leadFormSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createLead(companyId, parsed.data);
    revalidatePath(LEADS_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create lead', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function updateLeadAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('leads:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = leadIdSchema.merge(leadFormSchema).safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  const { leadId, ...values } = parsed.data;

  try {
    await service.updateLead(companyId, leadId, values);
    revalidatePath(LEADS_PATH);

    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update lead', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deleteLeadAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('leads:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = leadIdSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deleteLead(companyId, parsed.data.leadId);
    revalidatePath(LEADS_PATH);

    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete lead', { error, companyId });
    return err(toErrorPayload(error));
  }
}

/**
 * Convert a lead to a client. Needs **both** permissions: it creates a client
 * (`clients:create`) and mutates the lead (`leads:update`). Granting one without
 * the other must not let the conversion through a side door.
 */
export async function convertLeadAction(input: unknown): Promise<Result<{ clientId: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('leads:update');
    await requirePermission('clients:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = leadIdSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const result = await service.convertLead(companyId, parsed.data.leadId);
    revalidatePath(LEADS_PATH);
    revalidatePath('/dashboard/clients');

    return ok({ clientId: result.clientId });
  } catch (error) {
    logger.error('Failed to convert lead', { error, companyId });
    return err(toErrorPayload(error));
  }
}

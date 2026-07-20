'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { err, ok, type Result } from '@/types';

import * as service from './projects.service';
import { projectFormSchema } from './projects.validation';

/**
 * Project Server Actions. Each re-establishes the session, re-checks its
 * permission, and re-validates its input. The tenant comes from the session.
 */

const PROJECTS_PATH = '/dashboard/projects';

const idSchema = z.object({ projectId: z.uuid() });

export async function createProjectAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('projects:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = projectFormSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createProject(companyId, parsed.data);
    revalidatePath(PROJECTS_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create project', { error, companyId });
    return err(toErrorPayload(error));
  }
}

const quickCreateProjectSchema = z.object({
  name: z.string().trim().min(2, { error: 'Name this project.' }),
  clientId: z.uuid().nullish(),
});

/**
 * The "+ New project" item inside another form's project picker
 * (`CreatableSelectField`). `clientId` is accepted (and passed through when
 * the calling form already has one selected — e.g. an invoice's project
 * picker inheriting the invoice's client) but stays optional, exactly like
 * `projectFormSchema.clientId` itself: a project created this way with no
 * client is just as valid as one created from the full form.
 */
export async function quickCreateProjectAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('projects:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = quickCreateProjectSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  const values = projectFormSchema.parse({
    name: parsed.data.name,
    clientId: parsed.data.clientId ?? '',
    description: '',
    status: 'planning',
    priority: 'medium',
    billingType: 'fixed_price',
    budget: '',
    hourlyRate: '',
    estimatedHours: '',
    currency: '',
    startDate: '',
    endDate: '',
    managerId: '',
  });

  try {
    const created = await service.createProject(companyId, values);
    revalidatePath(PROJECTS_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to quick-create project', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function updateProjectAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('projects:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.merge(projectFormSchema).safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  const { projectId, ...values } = parsed.data;

  try {
    await service.updateProject(companyId, projectId, values);
    revalidatePath(PROJECTS_PATH);

    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update project', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deleteProjectAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('projects:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deleteProject(companyId, parsed.data.projectId);
    revalidatePath(PROJECTS_PATH);

    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete project', { error, companyId });
    return err(toErrorPayload(error));
  }
}

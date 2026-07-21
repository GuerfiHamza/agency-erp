'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { err, ok, type Result } from '@/types';

import * as service from './portfolio.service';
import { addImageSchema, nameFormSchema, projectFormSchema } from './portfolio.validation';

/**
 * Portfolio Server Actions.
 *
 * Each is a public HTTP endpoint: it re-establishes the session, re-checks
 * `portfolio:*`, and re-validates its input, same as every other module.
 */

const PORTFOLIO_PATH = '/dashboard/portfolio';
const SETTINGS_PATH = '/dashboard/portfolio/settings';

const idSchema = z.object({ id: z.uuid() });

// ---- Technologies ----

export async function createTechnologyAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('portfolio:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = nameFormSchema.safeParse(input);
  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createTechnology(companyId, parsed.data.name);
    revalidatePath(SETTINGS_PATH);
    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create technology', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function updateTechnologyAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('portfolio:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.merge(nameFormSchema).safeParse(input);
  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.updateTechnology(companyId, parsed.data.id, parsed.data.name);
    revalidatePath(SETTINGS_PATH);
    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update technology', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deleteTechnologyAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('portfolio:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deleteTechnology(companyId, parsed.data.id);
    revalidatePath(SETTINGS_PATH);
    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete technology', { error, companyId });
    return err(toErrorPayload(error));
  }
}

// ---- Categories ----

export async function createCategoryAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('portfolio:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = nameFormSchema.safeParse(input);
  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createCategory(companyId, parsed.data.name);
    revalidatePath(SETTINGS_PATH);
    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create category', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function updateCategoryAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('portfolio:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.merge(nameFormSchema).safeParse(input);
  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.updateCategory(companyId, parsed.data.id, parsed.data.name);
    revalidatePath(SETTINGS_PATH);
    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update category', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deleteCategoryAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('portfolio:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deleteCategory(companyId, parsed.data.id);
    revalidatePath(SETTINGS_PATH);
    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete category', { error, companyId });
    return err(toErrorPayload(error));
  }
}

// ---- Projects ----

export async function createProjectAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('portfolio:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = projectFormSchema.safeParse(input);
  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createProject(companyId, parsed.data);
    revalidatePath(PORTFOLIO_PATH);
    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create portfolio project', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function updateProjectAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('portfolio:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = z.object({ projectId: z.uuid() }).merge(projectFormSchema).safeParse(input);
  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  const { projectId, ...values } = parsed.data;

  try {
    await service.updateProject(companyId, projectId, values);
    revalidatePath(PORTFOLIO_PATH);
    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update portfolio project', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deleteProjectAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('portfolio:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = z.object({ projectId: z.uuid() }).safeParse(input);
  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deleteProject(companyId, parsed.data.projectId);
    revalidatePath(PORTFOLIO_PATH);
    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete portfolio project', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function addProjectImageAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('portfolio:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = addImageSchema.safeParse(input);
  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const added = await service.addProjectImage(companyId, parsed.data.projectId, parsed.data.storageKey);
    revalidatePath(PORTFOLIO_PATH);
    return ok({ id: added.id });
  } catch (error) {
    logger.error('Failed to add portfolio image', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function removeProjectImageAction(input: unknown): Promise<Result<{ removed: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('portfolio:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = z.object({ projectId: z.uuid(), imageId: z.uuid() }).safeParse(input);
  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.removeProjectImage(companyId, parsed.data.projectId, parsed.data.imageId);
    revalidatePath(PORTFOLIO_PATH);
    return ok({ removed: true });
  } catch (error) {
    logger.error('Failed to remove portfolio image', { error, companyId });
    return err(toErrorPayload(error));
  }
}

// ---- API key ----

/** Returns the plaintext key. Only ever the return value of this call — never stored, never logged again. */
export async function regenerateApiKeyAction(): Promise<Result<{ apiKey: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('portfolio:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  try {
    const apiKey = await service.regenerateApiKey(companyId);
    revalidatePath(SETTINGS_PATH);
    return ok({ apiKey });
  } catch (error) {
    logger.error('Failed to regenerate portfolio API key', { error, companyId });
    return err(toErrorPayload(error));
  }
}

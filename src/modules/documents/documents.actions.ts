'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { err, ok, type Result } from '@/types';

import * as service from './documents.service';
import { documentCreateSchema, documentDetailsSchema } from './documents.validation';

/**
 * Document Server Actions. Each re-establishes the session, re-checks its
 * permission, and re-validates its input. The tenant and uploader come from the
 * session, never from the payload.
 *
 * There is no download action here: `presignDownloadAction` in the storage module
 * already mints tenant-checked read URLs, and wrapping it would only re-check the
 * same key prefix.
 */

const DOCUMENTS_PATH = '/dashboard/documents';

const idSchema = z.object({ documentId: z.uuid() });

export async function createDocumentAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId, userId } = await requireTenantSession();

  try {
    await requirePermission('documents:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = documentCreateSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createDocument(companyId, userId, parsed.data);
    revalidatePath(DOCUMENTS_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create document', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function updateDocumentAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('documents:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.merge(documentDetailsSchema).safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  const { documentId, ...values } = parsed.data;

  try {
    await service.updateDocument(companyId, documentId, values);
    revalidatePath(DOCUMENTS_PATH);

    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update document', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deleteDocumentAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('documents:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deleteDocument(companyId, parsed.data.documentId);
    revalidatePath(DOCUMENTS_PATH);

    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete document', { error, companyId });
    return err(toErrorPayload(error));
  }
}

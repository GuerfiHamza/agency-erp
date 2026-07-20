'use server';

import { z } from 'zod';

import { requireTenantSession } from '@/lib/auth/session';
import { toErrorPayload, ValidationError, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  buildStorageKey,
  getStorageProvider,
  isAllowedMimeType,
  MAX_UPLOAD_BYTES,
  type PresignedUpload,
} from '@/lib/storage';
import { err, ok, type Result } from '@/types';

/**
 * Upload authorisation.
 *
 * Signing a URL *is* the authorisation decision — once minted, anyone holding it
 * can write those exact bytes to that exact key until it expires. So every check
 * that matters happens here, before signing: who you are, what tenant you are
 * in, what type, and how big.
 */

const presignSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(255),
  contentLength: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  /** Groups objects in the key, e.g. `documents`, `receipts`, `logos`. */
  scope: z.string().trim().min(1).max(40),
});

export async function presignUploadAction(input: unknown): Promise<Result<PresignedUpload>> {
  const { companyId, userId } = await requireTenantSession();

  const parsed = presignSchema.safeParse(input);

  if (!parsed.success) {
    return err(toErrorPayload(validationErrorFromZod(parsed.error)));
  }

  const { filename, contentType, contentLength, scope } = parsed.data;

  // Allowlist, never a denylist: a denylist is a promise to have thought of
  // every dangerous type, which nobody can keep.
  if (!isAllowedMimeType(contentType)) {
    return err(toErrorPayload(new ValidationError(`Files of type "${contentType}" are not allowed.`)));
  }

  if (contentLength > MAX_UPLOAD_BYTES) {
    const megabytes = Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024));
    return err(toErrorPayload(new ValidationError(`Files must be smaller than ${megabytes} MB.`)));
  }

  try {
    // The caller never chooses the key. It is derived from their tenant, so a
    // crafted filename cannot write into another company's prefix.
    const key = buildStorageKey({ companyId, scope, originalFilename: filename });
    const presigned = await getStorageProvider().presignUpload({ key, contentType, contentLength });

    logger.info('Upload presigned', { userId, companyId, key, contentType, contentLength });
    return ok(presigned);
  } catch (error) {
    logger.error('Failed to presign upload', { error, companyId });
    return err(toErrorPayload(error));
  }
}

const downloadSchema = z.object({
  key: z.string().trim().min(1),
  download: z.boolean().default(false),
});

/** Mint a short-lived read URL for an object the caller's company owns. */
export async function presignDownloadAction(input: unknown): Promise<Result<{ url: string }>> {
  const { companyId } = await requireTenantSession();

  const parsed = downloadSchema.safeParse(input);

  if (!parsed.success) {
    return err(toErrorPayload(validationErrorFromZod(parsed.error)));
  }

  // Every key begins with its owning company id, so this one comparison is the
  // tenant boundary for reads. Without it, any signed-in user could name any
  // key and be handed a URL to another company's documents.
  if (!parsed.data.key.startsWith(`${companyId}/`)) {
    logger.warn('Cross-tenant download attempt', { companyId, key: parsed.data.key });
    // Reported as not-found, not forbidden: "forbidden" would confirm the object
    // exists, which is itself information about another tenant.
    return err(toErrorPayload(new ValidationError('That file could not be found.')));
  }

  try {
    const url = await getStorageProvider().presignDownload({
      key: parsed.data.key,
      download: parsed.data.download,
    });

    return ok({ url });
  } catch (error) {
    logger.error('Failed to presign download', { error, companyId });
    return err(toErrorPayload(error));
  }
}

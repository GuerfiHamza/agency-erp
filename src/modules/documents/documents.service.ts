import 'server-only';

import { NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';

import * as repository from './documents.repository';
import type { DocumentAttachKind, DocumentCreateInput, DocumentDetailsInput } from './documents.validation';

/**
 * Document rules.
 *
 * Two policies live here. The attachment pair is resolved into exactly one
 * foreign key and the target must belong to this tenant. And the storage key —
 * which arrives from the browser — must sit under this company's prefix, or a
 * crafted key would let one tenant mint download URLs for another's objects
 * simply by naming them in a create call.
 */

export type { DocumentListItem, ListDocumentsQuery } from './documents.repository';

const NO_ATTACHMENT: repository.AttachmentColumns = { clientId: null, projectId: null, taskId: null };

async function resolveAttachment(
  companyId: string,
  kind: DocumentAttachKind,
  id: string | null,
): Promise<repository.AttachmentColumns> {
  if (kind === 'none' || !id) return NO_ATTACHMENT;

  if (!(await repository.attachmentExists(companyId, kind, id))) {
    throw new ValidationError('The linked record does not exist in this workspace.');
  }

  return {
    clientId: kind === 'client' ? id : null,
    projectId: kind === 'project' ? id : null,
    taskId: kind === 'task' ? id : null,
  };
}

/**
 * `buildStorageKey` derives every key from the caller's company, so a key that
 * does not start with this tenant's id was never one we signed.
 */
function assertOwnStorageKey(companyId: string, storageKey: string): void {
  if (!storageKey.startsWith(`${companyId}/`)) {
    logger.warn('Cross-tenant storage key rejected', { companyId, storageKey });
    throw new ValidationError('That upload could not be found. Please try uploading the file again.');
  }
}

export async function listDocuments(companyId: string, query: repository.ListDocumentsQuery) {
  return repository.listDocuments(companyId, query);
}

export async function getDocument(companyId: string, id: string) {
  const found = await repository.findById(companyId, id);

  if (!found) throw new NotFoundError('Document not found.');

  return found;
}

export async function listAttachmentOptions(companyId: string) {
  const [clients, projects, tasks] = await Promise.all([
    repository.listClientOptions(companyId),
    repository.listProjectOptions(companyId),
    repository.listTaskOptions(companyId),
  ]);

  return { clients, projects, tasks };
}

export async function createDocument(companyId: string, actorUserId: string, input: DocumentCreateInput) {
  assertOwnStorageKey(companyId, input.storageKey);

  const attachment = await resolveAttachment(companyId, input.attachKind, input.attachId);

  const created = await repository.create(companyId, {
    name: input.name,
    type: input.type,
    description: input.description,
    storageKey: input.storageKey,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    uploadedById: actorUserId,
    ...attachment,
  });

  logger.info('Document created', { companyId, documentId: created.id, storageKey: created.storageKey });

  return created;
}

/** Metadata only — the stored bytes of an existing document are never replaced. */
export async function updateDocument(companyId: string, id: string, input: DocumentDetailsInput) {
  await getDocument(companyId, id);

  const attachment = await resolveAttachment(companyId, input.attachKind, input.attachId);

  const updated = await repository.update(companyId, id, {
    name: input.name,
    type: input.type,
    description: input.description,
    ...attachment,
  });

  if (!updated) throw new NotFoundError('Document not found.');

  logger.info('Document updated', { companyId, documentId: id });

  return updated;
}

/**
 * Soft delete: the row goes, the object stays. Reclaiming storage is a sweep over
 * keys with no live row, not a per-delete side effect — a delete that half-fails
 * after the bytes are gone is unrecoverable, and one that half-fails before them
 * only leaves a file to collect later.
 */
export async function deleteDocument(companyId: string, id: string) {
  const deleted = await repository.softDelete(companyId, id);

  if (!deleted) throw new NotFoundError('Document not found.');

  logger.info('Document deleted', { companyId, documentId: id });

  return deleted;
}

import { z } from 'zod';

import { DB_LIMITS } from '@/config/constants';
import { MAX_UPLOAD_BYTES } from '@/lib/storage/provider';

/**
 * Document input schemas.
 *
 * A document is metadata plus a storage key: the bytes are already in storage by
 * the time anything here runs (see `FileUpload` + `presignUploadAction`). So
 * create takes the upload result, and **update deliberately does not** —
 * replacing the bytes of an existing row would leave the old object orphaned and
 * silently change what a shared link resolves to. Re-upload is a new document.
 *
 * The attachment is a `attachKind` + `attachId` pair here and one nullable
 * foreign key in the database, resolved by the service — same shape as an
 * activity's link.
 */

const optionalText = (max: number = DB_LIMITS.longText) =>
  z
    .string()
    .trim()
    .max(max, { error: `Keep this under ${max} characters.` })
    .transform((value) => value || null)
    .nullable();

export const DOCUMENT_TYPES = [
  'contract',
  'brief',
  'deliverable',
  'invoice',
  'receipt',
  'image',
  'other',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_ATTACH_KINDS = ['none', 'client', 'project', 'task'] as const;

export type DocumentAttachKind = (typeof DOCUMENT_ATTACH_KINDS)[number];

/** Name, type, description, and what it is attached to — everything that stays editable. */
export const documentDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Give the document a name.' })
    .max(DB_LIMITS.shortText, { error: 'That name is too long.' }),
  type: z.enum(DOCUMENT_TYPES),
  description: optionalText(),

  attachKind: z.enum(DOCUMENT_ATTACH_KINDS),
  attachId: z
    .uuid()
    .or(z.literal('').transform(() => null))
    .nullable(),
});

/** Create also carries the completed upload. Never trusted as-is — the service checks the key's tenant prefix. */
export const documentCreateSchema = documentDetailsSchema.extend({
  storageKey: z.string().trim().min(1).max(DB_LIMITS.longText),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().nonnegative().max(MAX_UPLOAD_BYTES),
});

export type DocumentDetailsValues = z.input<typeof documentDetailsSchema>;
export type DocumentDetailsInput = z.output<typeof documentDetailsSchema>;
export type DocumentCreateValues = z.input<typeof documentCreateSchema>;
export type DocumentCreateInput = z.output<typeof documentCreateSchema>;

/** Columns the documents table may be sorted by. Anything else is rejected, not ignored. */
export const DOCUMENT_SORT_FIELDS = ['name', 'type', 'sizeBytes', 'createdAt'] as const;

export type DocumentSortField = (typeof DOCUMENT_SORT_FIELDS)[number];

export function isDocumentSortField(value: string | null): value is DocumentSortField {
  return value !== null && (DOCUMENT_SORT_FIELDS as readonly string[]).includes(value);
}

// ponytail: documents have no status, so the table's `status` URL param carries the
// type facet. One filter slot, already wired end to end — a `type` param would be a
// second copy of the same machinery.
export function toDocumentTypeFilters(values: string[]): DocumentType[] {
  return values.filter((value): value is DocumentType =>
    (DOCUMENT_TYPES as readonly string[]).includes(value),
  );
}

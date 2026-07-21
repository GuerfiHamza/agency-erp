/**
 * Object storage contract.
 *
 * Uploads are **presigned**: the browser sends bytes straight to the storage
 * provider, and the app only ever mints a short-lived URL. Proxying files
 * through a Next.js server would pin a request (and its memory) for the length
 * of the transfer and would run into body-size limits for anything large.
 *
 * Downloads are presigned too, so nothing in the bucket is public: a document is
 * reachable only by someone the app just authorised.
 */

export interface PresignedUpload {
  /** Where the browser PUTs the bytes. */
  url: string;
  /** The key to persist on the owning row (e.g. `documents.storageKey`). */
  key: string;
  /** Headers the browser must echo, or the signature will not match. */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

export interface StorageProvider {
  readonly name: string;
  presignUpload(params: {
    key: string;
    contentType: string;
    contentLength: number;
  }): Promise<PresignedUpload>;
  /** Time-limited read URL. `download` forces a save dialog rather than inline render. */
  presignDownload(params: { key: string; expiresInSeconds?: number; download?: boolean }): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /**
   * Read an object's bytes directly, bypassing presigning.
   *
   * Presigned URLs cap out at a few days (S3's SigV4 hard limit is 7) — no use
   * for a portfolio image meant to sit in an `<img src>` on a public marketing
   * site indefinitely. This is that escape hatch: a public route handler reads
   * through it and streams the response itself, with our own credentials,
   * instead of handing out a URL that will eventually stop working.
   */
  read(key: string): Promise<StoredObject>;
}

/** Seconds a presigned URL stays valid. Short: it is a bearer token for the object. */
export const UPLOAD_URL_TTL_SECONDS = 60 * 5;
export const DOWNLOAD_URL_TTL_SECONDS = 60 * 5;

/** Hard ceiling per file. Enforced when signing, so an oversized PUT is never authorised. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const ALLOWED_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/csv',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.ms-excel',
] as const;

export type AllowedMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

export function isAllowedMimeType(value: string): value is AllowedMimeType {
  return (ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(value);
}

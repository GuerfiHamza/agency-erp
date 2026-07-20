import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import { clientEnv, serverEnv } from '@/config/env';

import {
  DOWNLOAD_URL_TTL_SECONDS,
  UPLOAD_URL_TTL_SECONDS,
  type PresignedUpload,
  type StorageProvider,
} from './provider';

/**
 * Filesystem storage for development.
 *
 * A real provider, not a stub: it mirrors S3's presigned semantics exactly —
 * the browser PUTs bytes to a signed, expiring URL and the app never proxies the
 * body. Only the destination differs, so code written against the interface
 * behaves the same in both environments and the upload flow is genuinely
 * testable without AWS credentials.
 *
 * The URLs it mints are served by `src/app/api/storage/local/[...key]/route.ts`,
 * which verifies the signature below before touching disk.
 *
 * Not for production: `validateEnv` requires `S3_BUCKET` there, because writing
 * uploads to a container filesystem loses them on the next deploy.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';

  private get root(): string {
    return resolve(process.cwd(), serverEnv.LOCAL_STORAGE_DIR);
  }

  async presignUpload({
    key,
    contentType,
  }: {
    key: string;
    contentType: string;
    contentLength: number;
  }): Promise<PresignedUpload> {
    const expiresAt = new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000);
    const url = signedUrl(key, 'PUT', expiresAt);

    return { url, key, headers: { 'Content-Type': contentType }, expiresAt };
  }

  async presignDownload({
    key,
    expiresInSeconds = DOWNLOAD_URL_TTL_SECONDS,
    download = false,
  }: {
    key: string;
    expiresInSeconds?: number;
    download?: boolean;
  }): Promise<string> {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const url = signedUrl(key, 'GET', expiresAt);

    return download ? `${url}&download=1` : url;
  }

  async delete(key: string): Promise<void> {
    await rm(resolveKey(this.root, key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(resolveKey(this.root, key));
      return true;
    } catch {
      return false;
    }
  }

  /** Used by the route handler once a signature checks out. */
  async write(key: string, body: Buffer): Promise<void> {
    const path = resolveKey(this.root, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  /** Absolute path for a key, for the route handler to stream. */
  pathFor(key: string): string {
    return resolveKey(this.root, key);
  }
}

/**
 * Map a key onto a path inside the storage root, refusing to escape it.
 *
 * Keys reach here from request URLs. Without this check, a key of
 * `../../.env` would read or overwrite files outside the storage directory —
 * classic path traversal.
 */
export function resolveKey(root: string, key: string): string {
  const path = resolve(join(root, key));

  if (path !== root && !path.startsWith(root + sep)) {
    throw new Error('Rejected storage key: resolves outside the storage root.');
  }

  return path;
}

function signingSecret(): string {
  // Reuses the auth secret: these signatures protect dev uploads, and adding a
  // second secret to configure would be ceremony without benefit.
  return serverEnv.BETTER_AUTH_SECRET;
}

/** HMAC over the fields that must not be tampered with. */
export function signaturePayload(key: string, method: string, expiresAtMs: number): string {
  return `${method}\n${key}\n${expiresAtMs}`;
}

export function computeSignature(key: string, method: string, expiresAtMs: number): string {
  return createHmac('sha256', signingSecret())
    .update(signaturePayload(key, method, expiresAtMs))
    .digest('hex');
}

function signedUrl(key: string, method: 'PUT' | 'GET', expiresAt: Date): string {
  const expires = expiresAt.getTime();
  const signature = computeSignature(key, method, expires);
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');

  return `${clientEnv.NEXT_PUBLIC_APP_URL}/api/storage/local/${encodedKey}?expires=${expires}&signature=${signature}`;
}

/** Constant-time signature check with an expiry test. Used by the route handler. */
export function verifySignature(params: {
  key: string;
  method: string;
  expires: string | null;
  signature: string | null;
}): boolean {
  if (!params.expires || !params.signature) return false;

  const expiresMs = Number(params.expires);

  if (!Number.isFinite(expiresMs) || expiresMs < Date.now()) return false;

  const expected = computeSignature(params.key, params.method, expiresMs);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(params.signature, 'utf8');

  // Length must match before timingSafeEqual, which throws on differing sizes.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

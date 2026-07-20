import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

import { serverEnv } from '@/config/env';
import { logger } from '@/lib/logger';

import { LocalStorageProvider } from './local-provider';
import { S3StorageProvider } from './s3-provider';
import type { StorageProvider } from './provider';

export * from './provider';
export { LocalStorageProvider } from './local-provider';

let cached: StorageProvider | undefined;

/**
 * The storage provider for this environment.
 *
 * Chosen by configuration, not by `NODE_ENV`: set `S3_BUCKET` locally and you
 * get real S3. Production cannot reach the local provider — `validateEnv`
 * refuses to boot without `S3_BUCKET`, because a container filesystem loses
 * every upload on the next deploy.
 */
export function getStorageProvider(): StorageProvider {
  if (cached) return cached;

  const bucket = serverEnv.S3_BUCKET;

  if (bucket) {
    cached = new S3StorageProvider(bucket);
  } else {
    logger.warn('No S3_BUCKET — uploads will be written to local disk.');
    cached = new LocalStorageProvider();
  }

  return cached;
}

/** Test seam. */
export function setStorageProvider(provider: StorageProvider | undefined): void {
  cached = provider;
}

/**
 * Build the object key for an upload.
 *
 * Three properties matter:
 *  - the `companyId` prefix keeps one tenant's objects addressable as a group,
 *    which is what makes per-tenant lifecycle rules and deletion tractable;
 *  - the filename is replaced by a UUID, so a user cannot choose the key —
 *    otherwise two people uploading `invoice.pdf` collide, and a crafted name is
 *    a traversal attempt;
 *  - the original extension is kept, because tooling and humans rely on it.
 */
export function buildStorageKey(params: {
  companyId: string;
  scope: string;
  originalFilename: string;
}): string {
  // Extension only, lowercased, and only if it looks like one.
  const raw = extname(params.originalFilename).toLowerCase();
  const extension = /^\.[a-z0-9]{1,12}$/.test(raw) ? raw : '';
  const scope = params.scope.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'misc';

  return `${params.companyId}/${scope}/${randomUUID()}${extension}`;
}

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { Readable } from 'node:stream';

import { NextResponse, type NextRequest } from 'next/server';

import { serverEnv } from '@/config/env';
import { logger } from '@/lib/logger';
import { LocalStorageProvider, verifySignature } from '@/lib/storage/local-provider';
import { MAX_UPLOAD_BYTES } from '@/lib/storage/provider';

/**
 * Endpoint backing the local storage provider's presigned URLs.
 *
 * Authorisation is the signature alone — deliberately, because that is what a
 * presigned URL *is*: the app decided at signing time that the caller could do
 * this, and the URL carries that decision. No session is consulted, exactly as
 * with S3.
 *
 * This route exists only when `S3_BUCKET` is unset. It refuses to run otherwise,
 * so a production deployment cannot be tricked into writing to local disk.
 */

function assertLocalProviderActive(): void {
  if (serverEnv.S3_BUCKET) {
    throw new Error('Local storage endpoint is disabled when S3 is configured.');
  }
}

/** Rebuild the key from the catch-all segments, undoing the encoding used when signing. */
async function keyFrom(context: RouteContext<'/api/storage/local/[...key]'>): Promise<string> {
  const { key } = await context.params;
  return key.map(decodeURIComponent).join('/');
}

export async function PUT(
  request: NextRequest,
  context: RouteContext<'/api/storage/local/[...key]'>,
): Promise<NextResponse> {
  try {
    assertLocalProviderActive();

    const key = await keyFrom(context);
    const { searchParams } = request.nextUrl;

    if (
      !verifySignature({
        key,
        method: 'PUT',
        expires: searchParams.get('expires'),
        signature: searchParams.get('signature'),
      })
    ) {
      return NextResponse.json({ error: 'Invalid or expired upload URL.' }, { status: 403 });
    }

    const body = Buffer.from(await request.arrayBuffer());

    // Re-checked here, not just at signing time: the signature covers the key
    // and expiry, not the body, so nothing stops a caller PUTting more bytes
    // than we intended to allow.
    if (body.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'File exceeds the maximum upload size.' }, { status: 413 });
    }

    const provider = new LocalStorageProvider();
    await provider.write(key, body);

    return NextResponse.json({ ok: true, key });
  } catch (error) {
    logger.error('Local storage upload failed', { error });
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  context: RouteContext<'/api/storage/local/[...key]'>,
): Promise<NextResponse | Response> {
  try {
    assertLocalProviderActive();

    const key = await keyFrom(context);
    const { searchParams } = request.nextUrl;

    if (
      !verifySignature({
        key,
        method: 'GET',
        expires: searchParams.get('expires'),
        signature: searchParams.get('signature'),
      })
    ) {
      return NextResponse.json({ error: 'Invalid or expired download URL.' }, { status: 403 });
    }

    const provider = new LocalStorageProvider();
    const path = provider.pathFor(key);
    const info = await stat(path).catch(() => null);

    if (!info?.isFile()) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    // Streamed rather than read into memory, so a large file does not become a
    // large allocation.
    const stream = Readable.toWeb(createReadStream(path)) as NodeReadableStream<Uint8Array>;

    return new Response(stream as unknown as BodyInit, {
      headers: {
        'Content-Length': String(info.size),
        // Always octet-stream: serving a user-uploaded file under a type the
        // browser will render invites stored XSS via an uploaded .html or .svg.
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': searchParams.get('download') ? 'attachment' : 'inline',
        // Signed URLs are per-user and short-lived; a shared cache must not keep them.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    logger.error('Local storage download failed', { error });
    return NextResponse.json({ error: 'Download failed.' }, { status: 500 });
  }
}

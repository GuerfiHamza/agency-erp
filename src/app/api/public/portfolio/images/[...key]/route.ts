import { NextResponse, type NextRequest } from 'next/server';

import { RateLimitError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { assertWithinRateLimit, clientIp } from '@/lib/rate-limit';
import { getStorageProvider } from '@/lib/storage';
import * as portfolio from '@/modules/portfolio/portfolio.service';

/**
 * Public, unauthenticated image serving for portfolio projects.
 *
 * Deliberately the one part of the portfolio API with no `X-API-Key` check —
 * a browser's `<img src>` cannot send custom headers, so these need to be
 * plain public URLs. What replaces the API key as the security boundary:
 *
 *  1. The key must resolve under this company's `portfolio/` prefix
 *     (`companyId/portfolio/...` — see `portfolio.service.ts`'s own comment
 *     on why every image key is validated against that exact scope at
 *     upload time). A key for any other object — a document, a receipt —
 *     can never have been saved here, so this route can never serve one.
 *  2. Only the four image MIME types this app ever allows uploading are ever
 *     served; anything else (however it got stored) 404s rather than being
 *     streamed back with a browser-renderable content type.
 *  3. Presigned URLs (S3's, or the local provider's) top out at a few days —
 *     no good for a permanent `<img src>` on a public site — so this reads
 *     the bytes directly through `StorageProvider.read` and streams them
 *     with our own server-side credentials instead of handing out a URL.
 */

const SERVABLE_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

async function keyFrom(context: RouteContext<'/api/public/portfolio/images/[...key]'>): Promise<string> {
  const { key } = await context.params;
  return key.map(decodeURIComponent).join('/');
}

export async function GET(
  request: NextRequest,
  context: RouteContext<'/api/public/portfolio/images/[...key]'>,
): Promise<Response> {
  try {
    assertWithinRateLimit(`public-portfolio-image:${await clientIp()}`, 300, 60);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    throw error;
  }

  const key = await keyFrom(context);
  const companyId = await portfolio.resolveSoleCompanyId();

  if (!companyId || !key.startsWith(`${companyId}/portfolio/`)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  try {
    const object = await getStorageProvider().read(key);

    if (!SERVABLE_CONTENT_TYPES.has(object.contentType)) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    return new Response(new Uint8Array(object.body), {
      headers: {
        'Content-Type': object.contentType,
        'Content-Length': String(object.body.byteLength),
        // Each key is a random, never-reused UUID — the bytes behind it never
        // change, the same "truly immutable" case Next documents for its own
        // hashed asset URLs.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    logger.warn('Public portfolio image not found', { key, error });
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
}

import { NextResponse, type NextRequest } from 'next/server';

import { assertWithinRateLimit, clientIp } from '@/lib/rate-limit';
import { RateLimitError } from '@/lib/errors';
import * as portfolio from '@/modules/portfolio/portfolio.service';

/**
 * Shared authentication for the public portfolio JSON endpoints (not the
 * image route — that one is deliberately open, see its own file).
 *
 * Returns the resolved `companyId` on success, or a `Response` to return
 * as-is on failure — callers do `const auth = await authenticate(request);
 * if (auth instanceof Response) return auth;`.
 */
export async function authenticate(request: NextRequest): Promise<string | Response> {
  try {
    // Generous relative to a human clicking around, tight relative to a
    // scraper — this is meant to be called by a server rendering pages, not
    // a browser polling on every keystroke.
    assertWithinRateLimit(`public-portfolio:${await clientIp()}`, 120, 60);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    throw error;
  }

  const presentedKey = request.headers.get('x-api-key');

  if (!presentedKey) {
    return NextResponse.json({ error: 'Missing X-API-Key header.' }, { status: 401 });
  }

  const companyId = await portfolio.resolveSoleCompanyId();

  if (!companyId || !(await portfolio.verifyApiKey(companyId, presentedKey))) {
    return NextResponse.json({ error: 'Invalid API key.' }, { status: 401 });
  }

  return companyId;
}

import { NextResponse, type NextRequest } from 'next/server';

import { ROUTES, SESSION_COOKIE_NAMES } from '@/config/constants';

/**
 * Clears a stale session cookie before redirecting to sign-in.
 *
 * `requireSession` (src/lib/auth/session.ts) sends the browser here instead of
 * straight to `/sign-in` when the database says a session is invalid (expired,
 * deleted, or deactivated) but the cookie is still present — a Server
 * Component cannot mutate cookies itself, only a Route Handler can. Without
 * this, `proxy.ts`'s optimistic "already signed in" check (cookie presence
 * only, never the database) would immediately bounce the request from
 * `/sign-in` back to the protected page, which would fail the same database
 * check again: an infinite redirect loop between the two.
 */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) {
    return ROUTES.signIn;
  }

  return next;
}

export function GET(request: NextRequest): NextResponse {
  const next = safeNext(request.nextUrl.searchParams.get('next'));
  const response = NextResponse.redirect(new URL(next, request.url));

  for (const name of SESSION_COOKIE_NAMES) {
    response.cookies.delete(name);
  }

  return response;
}

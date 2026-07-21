import { NextResponse, type NextRequest } from 'next/server';

import { ROUTES, SESSION_COOKIE_NAMES } from '@/config/constants';

/**
 * Proxy — what earlier Next.js versions called Middleware.
 *
 * Renamed in Next 16 (see
 * `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`). The file
 * must sit beside `app/`, the exported function should be named `proxy`, and the
 * `edge` runtime is not supported here — proxy always runs on Node.
 *
 * This is an **optimistic** check and nothing more. It only looks for the
 * presence of a session cookie; it never reads the database and never trusts the
 * cookie's contents. A cookie can be forged or stale, so this cannot be a
 * security boundary — it exists to keep signed-out visitors off protected URLs
 * and to bounce signed-in users away from the sign-in page.
 *
 * Real enforcement lives in the Data Access Layer (`src/lib/auth/session.ts`),
 * which validates the session against the database on every page and action.
 * The docs are explicit that proxy runs on every request including prefetches,
 * so a database call here would be felt on every hover.
 */

/** Routes that require a session. Matched by prefix, so children are covered. */
const PROTECTED_PREFIXES = [ROUTES.dashboard, ROUTES.onboarding];

/**
 * Routes a signed-in user has no reason to see.
 *
 * `/reset-password` is deliberately absent: a reset link must still work for
 * someone who happens to have a live session — bouncing them to the dashboard
 * would make the emailed link useless exactly when they are trying to recover an
 * account they suspect is compromised.
 */
const AUTH_ROUTES: string[] = [ROUTES.signIn, ROUTES.signUp, ROUTES.forgotPassword];

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => Boolean(request.cookies.get(name)?.value));
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const isAuthenticated = hasSessionCookie(request);

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !isAuthenticated) {
    const signInUrl = new URL(ROUTES.signIn, request.url);
    // Preserve the destination so sign-in can return the user to it. Only the
    // path is kept — never the full URL, which could be pointed off-site.
    signInUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (AUTH_ROUTES.includes(pathname) && isAuthenticated) {
    return NextResponse.redirect(new URL(ROUTES.dashboard, request.url));
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Skip Next internals and static assets. `/api/auth` is excluded because the
   * auth endpoints must stay reachable while signed out — redirecting them would
   * make signing in impossible.
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};

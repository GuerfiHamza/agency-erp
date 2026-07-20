import 'server-only';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { ROUTES } from '@/config/constants';
import type { PermissionSlug } from '@/config/permissions';
import { ForbiddenError, UnauthorizedError } from '@/lib/errors';
import { getUserPermissions } from '@/modules/rbac/rbac.service';

import { auth, type Session } from './auth';

/**
 * The Data Access Layer for authentication.
 *
 * This is where auth is actually enforced. `src/proxy.ts` only does an
 * optimistic cookie check to keep signed-out users off protected URLs; it
 * cannot be trusted, because a cookie's presence is not proof of a valid
 * session. Every page, Server Action, and Route Handler that touches real data
 * must call through here.
 *
 * Deliberately not called from layouts: layouts do not re-render on client-side
 * navigation (Partial Rendering), so a check there would pass once and then be
 * skipped for the rest of the session. Check in the page or beside the data.
 */

/**
 * The current session, or null.
 *
 * `cache` memoizes for the render pass, so a page and its components can each
 * ask for the session without re-reading it per component. The memo does not
 * outlive the request.
 *
 * A deactivated user is treated as signed out. `isActive` is checked here rather
 * than in each page because this is the one chokepoint every caller goes
 * through — a check anywhere else is a check someone will forget. Better Auth
 * has no concept of our `isActive` column, so it will happily issue and accept
 * sessions for a deactivated account; this is what makes deactivation real.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) return null;
  if (session.user.isActive === false) return null;

  return session;
});

export const getCurrentUser = cache(async () => {
  const session = await getSession();
  return session?.user ?? null;
});

/**
 * Require a signed-in user in a **page or layout**, redirecting if absent.
 *
 * Do not call from a Server Action: `redirect` throws, which a caller's
 * try/catch may swallow, and an action should return a typed failure the form
 * can render. Use `requireSessionOrThrow` there.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();

  if (!session) {
    redirect(ROUTES.signIn);
  }

  return session;
}

/** Require a signed-in user in a Server Action or Route Handler. Throws. */
export async function requireSessionOrThrow(): Promise<Session> {
  const session = await getSession();

  if (!session) {
    throw new UnauthorizedError();
  }

  return session;
}

/**
 * A user who has completed onboarding and belongs to a company.
 *
 * `companyId` is nullable in the schema because Better Auth creates the user row
 * during sign-up, before a company exists. Everything tenant-scoped needs it
 * present, so this narrows the type once instead of every caller re-checking.
 */
export interface TenantSession {
  session: Session;
  userId: string;
  companyId: string;
}

export async function requireTenantSession(): Promise<TenantSession> {
  const session = await requireSession();
  const companyId = session.user.companyId;

  if (!companyId) {
    // Signed in but not onboarded — a real state, not an error.
    redirect(ROUTES.onboarding);
  }

  return { session, userId: session.user.id, companyId };
}

/** Whether the current user holds a permission. Returns false when signed out. */
export async function can(permission: PermissionSlug): Promise<boolean> {
  const session = await getSession();

  if (!session) return false;

  const granted = await getUserPermissions(session.user.id);
  return granted.has(permission);
}

/**
 * Assert the current user holds a permission. Throws `ForbiddenError`.
 *
 * The authorization check every mutation must make. Server Actions are public
 * endpoints — hiding a button in the UI protects nothing.
 */
export async function requirePermission(permission: PermissionSlug): Promise<Session> {
  const session = await requireSessionOrThrow();
  const granted = await getUserPermissions(session.user.id);

  if (!granted.has(permission)) {
    throw new ForbiddenError();
  }

  return session;
}

/**
 * Application-wide constants. Values here must be stable across requests and
 * free of environment lookups — environment access belongs in `config/env.ts`.
 */

export const APP_NAME = 'NEODOTT';
export const APP_DESCRIPTION =
  "NEODOTT's internal agency management platform — clients, projects, and finances in one place.";

/** Route segments that must stay in sync with the App Router folder names. */
export const ROUTES = {
  home: '/',
  signIn: '/sign-in',
  signUp: '/sign-up',
  /** Shown after sign-up: the account exists but the address is unproven. */
  checkEmail: '/check-email',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  /** Signed in but not yet attached to a company — where a company is created. */
  onboarding: '/onboarding',
  dashboard: '/dashboard',
  /** Where an emailed invitation link lands. Public: the invitee has no account yet. */
  acceptInvitation: '/accept-invitation',
} as const;

export type Route = (typeof ROUTES)[keyof typeof ROUTES];

/**
 * Better Auth's session cookie. The `__Secure-` prefix is added automatically
 * when secure cookies are on (production), so both names must be checked.
 * Shared between `proxy.ts` (optimistic presence check), `session.ts` (clears
 * a stale cookie before bouncing to sign-in), and the clear-session route.
 */
export const SESSION_COOKIE_NAMES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
] as const;

export const PAGINATION = {
  defaultPage: 1,
  defaultPageSize: 25,
  maxPageSize: 100,
  pageSizeOptions: [10, 25, 50, 100],
} as const;

export const SESSION = {
  /** Seconds a session stays valid without activity. */
  expiresIn: 60 * 60 * 24 * 7,
  /** Refresh the session cookie at most this often, in seconds. */
  updateAge: 60 * 60 * 24,
  // No cookie-cache window: sessions are read from the database on every
  // request so revocation is immediate. See lib/auth/auth.ts.
} as const;

export const PASSWORD = {
  minLength: 12,
  maxLength: 128,
} as const;

/**
 * Short by design: a reset link is a bearer credential for the account. If it
 * sits in an inbox for a day it is a day-long key to the workspace.
 */
export const PASSWORD_RESET_TOKEN_TTL_SECONDS = 60 * 30;

/** Longer — verification is not a credential, and people check mail late. */
export const EMAIL_VERIFICATION_TOKEN_TTL_SECONDS = 60 * 60 * 24;

/**
 * Invitations last days, not minutes: they are sent to people who do not yet
 * have an account and may be away when it arrives. Still bounded — an invitation
 * is a bearer credential for joining a company, so it must not be valid forever.
 */
export const INVITATION_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

/** Postgres identifier ceiling; enforced in Zod so errors surface before the DB rejects them. */
export const DB_LIMITS = {
  shortText: 255,
  mediumText: 1_000,
  longText: 10_000,
} as const;

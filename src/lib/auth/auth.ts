import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';

import {
  EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
  PASSWORD,
  PASSWORD_RESET_TOKEN_TTL_SECONDS,
  SESSION,
} from '@/config/constants';
import { serverEnv, isProduction } from '@/config/env';
import { db, schema } from '@/db';
import { passwordResetEmail, sendEmail, verifyEmailEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

/**
 * Better Auth server instance.
 *
 * Configuration only — flows live in `modules/auth`, and enforcement lives in
 * `lib/auth/session.ts`. Keeping business rules out of this file is what stops
 * Better Auth from quietly becoming the place the domain accumulates.
 *
 * Email verification and password reset stay off until Phase 4 brings the email
 * service; enabling them without a transport would lock new accounts out.
 */
export const auth = betterAuth({
  appName: 'agency-erp',
  secret: serverEnv.BETTER_AUTH_SECRET,
  baseURL: serverEnv.BETTER_AUTH_URL,

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD.minLength,
    maxPasswordLength: PASSWORD.maxLength,

    /**
     * Single-tenant lockdown (user decision, 2026-07-18): this deployment is
     * for one company only, so nobody may create a new account through the
     * public API — `/sign-up` throws `EMAIL_PASSWORD_SIGN_UP_DISABLED`
     * regardless of what the UI does. This is the real boundary; the removed
     * `/sign-up` form was only the other half. The one way in now is an admin
     * invitation (`src/modules/users`), which writes the user row directly and
     * never calls `signUpEmail`.
     */
    disableSignUp: true,

    /**
     * A company owner's email is the only account-recovery path that exists. An
     * unverified typo means a workspace nobody can ever get back into, so the
     * address is proven before it is relied on.
     *
     * Two behaviours follow from this flag, both deliberate:
     *  - sign-up returns no session (`token: null`), so the user must verify
     *    before they can sign in;
     *  - signing up with an address that already exists returns a *generic*
     *    success with a synthetic, never-persisted user id, so the endpoint
     *    cannot be used to enumerate accounts. Nothing may treat
     *    `signUpEmail().user.id` as a real row — see `auth.actions.ts`.
     */
    requireEmailVerification: true,

    sendResetPassword: async ({ user, url }) => {
      await sendEmail(
        passwordResetEmail({
          to: user.email,
          name: user.name,
          url,
          expiresInMinutes: Math.round(PASSWORD_RESET_TOKEN_TTL_SECONDS / 60),
        }),
      );
    },
    resetPasswordTokenExpiresIn: PASSWORD_RESET_TOKEN_TTL_SECONDS,

    onPasswordReset: async ({ user }) => {
      logger.info('Password reset completed', { userId: user.id });
    },
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(verifyEmailEmail({ to: user.email, name: user.name, url }));
    },
    sendOnSignUp: true,
    /** Clicking the link signs the user in, so verification is one click, not two. */
    autoSignInAfterVerification: true,
    expiresIn: EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
  },

  user: {
    additionalFields: {
      /**
       * Surfaces the ERP column on `session.user` so tenant scoping is typed
       * rather than re-queried on every request.
       *
       * `input: false` is the important part: without it a client could set its
       * own `companyId` in the sign-up payload and join any tenant it named.
       * It is assigned server-side during onboarding.
       */
      companyId: { type: 'string', required: false, input: false },
      isActive: { type: 'boolean', required: false, input: false, defaultValue: true },
      jobTitle: { type: 'string', required: false, input: false },
    },
  },

  session: {
    expiresIn: SESSION.expiresIn,
    updateAge: SESSION.updateAge,
    /**
     * Deliberately disabled.
     *
     * The cookie cache serves the session from a signed cookie without touching
     * the database, which is faster but means revocation lags by up to its
     * maxAge: deactivate a user or delete their session and they keep working
     * until the cache expires. For an ERP, "remove this person's access now"
     * has to mean now — an offboarded employee retaining access for even five
     * minutes is the wrong trade.
     *
     * The cost is one indexed lookup on `session.token` per request, which is
     * the correct price for a session read.
     */
    cookieCache: { enabled: false },
  },

  advanced: {
    useSecureCookies: isProduction(),
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
    },
    database: {
      /**
       * Makes auth ids real UUIDs so every key in the schema is one type.
       *
       * With a pg adapter (which reports `supportsUUIDs: true`) this tells
       * Better Auth to send no id at all and let `DEFAULT gen_random_uuid()`
       * supply it — so the auth tables' `id` columns must keep that default.
       */
      generateId: 'uuid',
    },
  },

  trustedOrigins: [serverEnv.BETTER_AUTH_URL],

  // nextCookies must be the last plugin: it wraps the response to flush
  // Set-Cookie headers through Next.js's cookie API.
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
export type Session = Auth['$Infer']['Session'];
export type SessionUser = Session['user'];

'use server';

import { APIError } from 'better-auth/api';
import { headers } from 'next/headers';

import { ROUTES } from '@/config/constants';
import { auth } from '@/lib/auth/auth';
import { getSession } from '@/lib/auth/session';
import {
  ConflictError,
  toErrorPayload,
  UnauthorizedError,
  validationErrorFromZod,
  ValidationError,
} from '@/lib/errors';
import { logger } from '@/lib/logger';
import { assertWithinRateLimit, clientIp } from '@/lib/rate-limit';
import { err, ok, type Result } from '@/types';

import { registerCompanyForUser } from './auth.service';
import {
  forgotPasswordSchema,
  onboardingSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signInSchema,
} from './auth.validation';

/**
 * Auth Server Actions.
 *
 * Every export in a `'use server'` module must be an async function — the
 * compiler turns each one into a callable HTTP endpoint, so a re-exported
 * constant here is a build error, not a style issue.
 *
 * Because these are public endpoints, each action re-validates its input on the
 * server no matter what the client form already checked. A hand-rolled POST does
 * not run React Hook Form.
 *
 * Actions return a `Result` instead of throwing or redirecting: `redirect()`
 * works by throwing, which a caller's try/catch can swallow, and the form needs
 * a value it can render inline. Navigation is the client's job once it sees
 * `success: true`.
 */

/** Map Better Auth's thrown `APIError` onto our typed errors. */
function fromAuthApiError(error: unknown, logMessage: string): Result<never> {
  if (error instanceof APIError) {
    if (error.status === 'UNAUTHORIZED' || error.status === 'FORBIDDEN') {
      return err(toErrorPayload(new UnauthorizedError('Incorrect email or password.')));
    }

    if (error.status === 'UNPROCESSABLE_ENTITY' || error.status === 'BAD_REQUEST') {
      return err(toErrorPayload(new ValidationError(error.message)));
    }

    if (error.status === 'CONFLICT') {
      return err(toErrorPayload(new ConflictError(error.message)));
    }
  }

  // Unexpected: log it in full, tell the user nothing specific.
  logger.error(logMessage, { error });
  return err(toErrorPayload(error));
}

export async function signInAction(input: unknown): Promise<Result<{ userId: string }>> {
  try {
    assertWithinRateLimit(`sign-in:${await clientIp()}`, 10, 5 * 60);
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = signInSchema.safeParse(input);

  if (!parsed.success) {
    return err(toErrorPayload(validationErrorFromZod(parsed.error)));
  }

  try {
    const result = await auth.api.signInEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
        rememberMe: parsed.data.rememberMe,
      },
      // Required: Better Auth writes the session cookie through these headers.
      headers: await headers(),
    });

    logger.info('User signed in', { userId: result.user.id });
    return ok({ userId: result.user.id });
  } catch (error) {
    // An unverified account also lands here as FORBIDDEN. It is reported as a
    // credential failure rather than "verify your email" on purpose: the latter
    // confirms the address is registered, which is the enumeration leak the
    // generic sign-up response exists to prevent. Users who need the link have
    // the "resend" path on /check-email.
    return fromAuthApiError(error, 'Sign-in failed');
  }
}

/**
 * Create the caller's company and make them its owner.
 *
 * This is where a workspace actually comes into being. It requires a real
 * session, so the user id is known to exist and to have proven their address.
 */
export async function onboardAction(input: unknown): Promise<Result<{ companyId: string }>> {
  const session = await getSession();

  if (!session) {
    return err(toErrorPayload(new UnauthorizedError()));
  }

  if (session.user.companyId) {
    return err(toErrorPayload(new ConflictError('This account already belongs to a company.')));
  }

  const parsed = onboardingSchema.safeParse(input);

  if (!parsed.success) {
    return err(toErrorPayload(validationErrorFromZod(parsed.error)));
  }

  try {
    const { companyId } = await registerCompanyForUser(session.user.id, parsed.data.companyName);
    logger.info('Company created', { userId: session.user.id, companyId });
    return ok({ companyId });
  } catch (error) {
    logger.error('Onboarding failed', { error, userId: session.user.id });
    return err(toErrorPayload(error));
  }
}

/**
 * Start a password reset.
 *
 * Always reports success. Whether an address is registered is not this
 * endpoint's news to share — the alternative is an oracle that confirms which
 * of a leaked email list have accounts here.
 */
export async function forgotPasswordAction(input: unknown): Promise<Result<{ sent: true }>> {
  try {
    assertWithinRateLimit(`forgot-password:${await clientIp()}`, 5, 15 * 60);
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = forgotPasswordSchema.safeParse(input);

  if (!parsed.success) {
    return err(toErrorPayload(validationErrorFromZod(parsed.error)));
  }

  try {
    await auth.api.requestPasswordReset({
      body: { email: parsed.data.email, redirectTo: ROUTES.resetPassword },
      headers: await headers(),
    });
  } catch (error) {
    // Swallowed on purpose. A failure here (unknown address, send error) must
    // not change what the caller sees, or the timing/wording becomes the oracle
    // this design avoids. It is logged for operators instead.
    logger.warn('Password reset request did not complete', { error });
  }

  return ok({ sent: true });
}

/** Finish a password reset using the emailed token. */
export async function resetPasswordAction(input: unknown): Promise<Result<{ reset: true }>> {
  try {
    assertWithinRateLimit(`reset-password:${await clientIp()}`, 10, 15 * 60);
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = resetPasswordSchema.safeParse(input);

  if (!parsed.success) {
    return err(toErrorPayload(validationErrorFromZod(parsed.error)));
  }

  try {
    await auth.api.resetPassword({
      body: { newPassword: parsed.data.password, token: parsed.data.token },
      headers: await headers(),
    });

    return ok({ reset: true });
  } catch (error) {
    if (error instanceof APIError) {
      // An expired or reused link is the common case and is worth naming: it is
      // about the link, not the account, so it leaks nothing.
      return err(
        toErrorPayload(new ValidationError('This reset link is invalid or has expired. Request a new one.')),
      );
    }

    logger.error('Password reset failed', { error });
    return err(toErrorPayload(error));
  }
}

/** Re-send a verification email. Reports success regardless, same as reset. */
export async function resendVerificationAction(input: unknown): Promise<Result<{ sent: true }>> {
  try {
    assertWithinRateLimit(`resend-verification:${await clientIp()}`, 5, 15 * 60);
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = resendVerificationSchema.safeParse(input);

  if (!parsed.success) {
    return err(toErrorPayload(validationErrorFromZod(parsed.error)));
  }

  try {
    await auth.api.sendVerificationEmail({
      body: { email: parsed.data.email, callbackURL: ROUTES.onboarding },
      headers: await headers(),
    });
  } catch (error) {
    logger.warn('Verification resend did not complete', { error });
  }

  return ok({ sent: true });
}

export async function signOutAction(): Promise<Result<null>> {
  try {
    await auth.api.signOut({ headers: await headers() });
    return ok(null);
  } catch (error) {
    logger.error('Sign-out failed', { error });
    return err(toErrorPayload(error));
  }
}

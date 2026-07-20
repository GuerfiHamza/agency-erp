import { z } from 'zod';

import { DB_LIMITS, PASSWORD } from '@/config/constants';

/**
 * Auth input schemas.
 *
 * One definition per form, shared by the client (React Hook Form resolver) and
 * the server (Server Action). Validating in both places is not duplication: the
 * client copy is for feedback, the server copy is the one that is trusted, since
 * a Server Action is a public endpoint that anyone can POST to.
 *
 * Where a schema has a `.default()` or a transform, its input and output types
 * differ, so both are exported — React Hook Form needs the input type for field
 * values and the output type for the submit handler.
 */

/**
 * Trim and lowercase **before** validating, via `.pipe`.
 *
 * `z.email().trim().toLowerCase()` reads as though it cleans the input first,
 * but the chained transforms run *after* the check — so " alex@example.com ",
 * which is what pasting from a mail client routinely produces, was rejected as
 * an invalid address instead of being trimmed. Verified with both forms.
 *
 * This matters on sign-in especially: the error there is deliberately generic,
 * so the user would have been told their credentials were wrong, with no hint
 * that an invisible space was the real problem.
 */
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email({ error: 'Enter a valid email address.' })
      .max(DB_LIMITS.shortText, { error: 'That email is too long.' }),
  );

/**
 * Length is the only rule.
 *
 * Composition rules (a digit, a symbol, mixed case) push people toward
 * `Password1!` and are worse than a long passphrase — NIST SP 800-63B advises
 * against them. Better Auth enforces the same bounds; this schema exists to say
 * so before a round trip.
 */
const password = z
  .string()
  .min(PASSWORD.minLength, { error: `Use at least ${PASSWORD.minLength} characters.` })
  .max(PASSWORD.maxLength, { error: 'That password is too long.' });

const companyName = z
  .string()
  .trim()
  .min(2, { error: 'Enter your company name.' })
  .max(DB_LIMITS.shortText, { error: 'That company name is too long.' });

export const signInSchema = z.object({
  email,
  // Not `password`: an existing account may predate a rule change, and telling
  // a signed-out visitor their stored password is too short leaks information.
  password: z.string().min(1, { error: 'Enter your password.' }),
  rememberMe: z.boolean().default(true),
});

export type SignInFormValues = z.input<typeof signInSchema>;
export type SignInInput = z.output<typeof signInSchema>;

export const onboardingSchema = z.object({ companyName });

export type OnboardingFormValues = z.input<typeof onboardingSchema>;
export type OnboardingInput = z.output<typeof onboardingSchema>;

export const forgotPasswordSchema = z.object({ email });

export type ForgotPasswordFormValues = z.input<typeof forgotPasswordSchema>;
export type ForgotPasswordInput = z.output<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    /** Comes from the emailed link, not from the user. */
    token: z.string().min(1, { error: 'This reset link is invalid.' }),
    password,
    confirmPassword: z.string(),
  })
  // Cross-field check, so the error is attached to confirmPassword rather than
  // the form as a whole — that is where the user can fix it.
  .refine((data) => data.password === data.confirmPassword, {
    error: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export type ResetPasswordFormValues = z.input<typeof resetPasswordSchema>;
export type ResetPasswordInput = z.output<typeof resetPasswordSchema>;

export const resendVerificationSchema = z.object({ email });

export type ResendVerificationInput = z.output<typeof resendVerificationSchema>;

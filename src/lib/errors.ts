/**
 * Typed application errors.
 *
 * Every error thrown by the domain, service, or repository layers should be an
 * `AppError` subclass. This lets the delivery layer (server actions, route
 * handlers) map failures to responses without inspecting messages, and keeps
 * internal details out of client payloads.
 */

export const ERROR_CODES = {
  VALIDATION: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Field-scoped messages, shaped to match React Hook Form's `setError` API. */
export type FieldErrors = Record<string, string[]>;

export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly statusCode: number;

  /**
   * Whether the message is safe to show a user. Non-exposable errors are
   * replaced with a generic message at the delivery boundary.
   */
  readonly isExposable: boolean = true;

  constructor(message: string, cause?: unknown) {
    // Native ES2022 `cause`, rather than a redeclared field — keeps the chain
    // visible to console/inspectors and anything that walks `error.cause`.
    super(message, { cause });
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  readonly code = ERROR_CODES.VALIDATION;
  readonly statusCode = 400;

  constructor(
    message = 'The submitted data is invalid.',
    readonly fieldErrors: FieldErrors = {},
    cause?: unknown,
  ) {
    super(message, cause);
  }
}

export class UnauthorizedError extends AppError {
  readonly code = ERROR_CODES.UNAUTHORIZED;
  readonly statusCode = 401;

  constructor(message = 'You must be signed in to do that.', cause?: unknown) {
    super(message, cause);
  }
}

export class ForbiddenError extends AppError {
  readonly code = ERROR_CODES.FORBIDDEN;
  readonly statusCode = 403;

  constructor(message = 'You do not have permission to do that.', cause?: unknown) {
    super(message, cause);
  }
}

export class NotFoundError extends AppError {
  readonly code = ERROR_CODES.NOT_FOUND;
  readonly statusCode = 404;

  constructor(resource = 'Resource', cause?: unknown) {
    super(`${resource} was not found.`, cause);
  }
}

export class ConflictError extends AppError {
  readonly code = ERROR_CODES.CONFLICT;
  readonly statusCode = 409;

  constructor(message = 'That change conflicts with existing data.', cause?: unknown) {
    super(message, cause);
  }
}

export class RateLimitError extends AppError {
  readonly code = ERROR_CODES.RATE_LIMITED;
  readonly statusCode = 429;

  constructor(
    message = 'Too many requests. Try again shortly.',
    readonly retryAfterSeconds?: number,
    cause?: unknown,
  ) {
    super(message, cause);
  }
}

/**
 * An unexpected failure. Never exposable: the message may contain connection
 * strings, SQL, or third-party internals.
 */
export class InternalError extends AppError {
  readonly code = ERROR_CODES.INTERNAL;
  readonly statusCode = 500;
  override readonly isExposable = false;

  constructor(message = 'An unexpected error occurred.', cause?: unknown) {
    super(message, cause);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Build a `ValidationError` from a Zod failure.
 *
 * Lives here rather than in each module's actions because every form in the app
 * needs the same mapping, and `error.issues` is the one shape Zod 4 guarantees.
 * Issues with an empty path (object-level refinements) are keyed `_form` so the
 * UI has somewhere to render them.
 */
export function validationErrorFromZod(
  error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> },
  message = 'Check the highlighted fields.',
): ValidationError {
  const fieldErrors: FieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form';
    (fieldErrors[key] ??= []).push(issue.message);
  }

  return new ValidationError(message, fieldErrors);
}

/** Normalize any thrown value into an AppError so callers can rely on the shape. */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof Error) return new InternalError(error.message, error);
  return new InternalError('An unexpected error occurred.', error);
}

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

/** Serializable failure shape returned to clients. Contains no stack or cause. */
export interface ErrorPayload {
  code: ErrorCode;
  message: string;
  fieldErrors?: FieldErrors;
}

/**
 * Strip an error down to what is safe to send to a client. Messages from
 * non-exposable errors are replaced with a generic string.
 */
export function toErrorPayload(error: unknown): ErrorPayload {
  const appError = toAppError(error);

  return {
    code: appError.code,
    message: appError.isExposable ? appError.message : GENERIC_MESSAGE,
    ...(appError instanceof ValidationError && Object.keys(appError.fieldErrors).length > 0
      ? { fieldErrors: appError.fieldErrors }
      : {}),
  };
}

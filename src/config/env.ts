import { z } from 'zod';

/**
 * Environment variable validation.
 *
 * Server variables are validated lazily on first access and are never readable
 * from the browser. Client variables must be referenced as literal
 * `process.env.NEXT_PUBLIC_*` expressions so Next.js can inline them at build
 * time — see `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`.
 */

const nodeEnvSchema = z.enum(['development', 'test', 'production']);

const serverEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema.default('development'),

  /** PostgreSQL connection string used by Drizzle and the pg pool. */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  /**
   * Max connections in the `pg` pool. Optional — defaults differ by
   * environment (see `src/db/index.ts`). Shared-hosting Postgres plans often
   * cap total concurrent connections well below the default production value,
   * so this is configurable rather than hardcoded.
   */
  DB_POOL_MAX: z.coerce.number().int().positive().optional(),

  /** Signing secret for Better Auth sessions. Must be high-entropy in production. */
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),

  /** Absolute origin Better Auth issues callbacks against. */
  BETTER_AUTH_URL: z.url(),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ---- Email (optional) ------------------------------------------------
  // Optional by design: without a key the app uses the console transport and
  // prints emails to the log, so the reset/verification flows are testable in
  // development. Production readiness is asserted separately in `validateEnv`.
  RESEND_API_KEY: z.string().min(1).optional(),
  /** RFC 5322 sender, e.g. `Nexus Agency <noreply@example.com>`. */
  EMAIL_FROM: z.string().min(3).optional(),

  // ---- Object storage (optional) ---------------------------------------
  // Same rationale: absent S3 config falls back to the local-disk provider so
  // uploads work in development.
  S3_BUCKET: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  /** Set for S3-compatible services (MinIO, R2). Omit for AWS. */
  S3_ENDPOINT: z.url().optional(),
  /** Directory used by the local storage provider. */
  LOCAL_STORAGE_DIR: z.string().min(1).default('.storage'),
});

const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;
type ClientEnv = z.infer<typeof clientEnvSchema>;

const isServer = typeof window === 'undefined';

/**
 * `next build` imports modules that reach `env` before real secrets exist (for
 * example inside a Docker image build). Setting SKIP_ENV_VALIDATION=1 defers
 * failure to runtime, where the values are actually present.
 */
const shouldSkipValidation = process.env.SKIP_ENV_VALIDATION === '1';

function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n');
}

function parseServerEnv(): ServerEnv {
  if (!isServer) {
    throw new Error('Server environment variables cannot be read in the browser.');
  }

  // `next build` imports every module to collect route metadata, which
  // evaluates module-scope reads like `serverEnv.BETTER_AUTH_SECRET` — inside a
  // Docker build, where no real secrets exist. Hand back the raw environment so
  // the build proceeds; instrumentation.ts validates for real at server start,
  // before any request is served.
  if (shouldSkipValidation) {
    return process.env as unknown as ServerEnv;
  }

  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(`Invalid server environment variables:\n${formatIssues(parsed.error)}`);
  }

  return parsed.data;
}

function parseClientEnv(): ClientEnv {
  // Literal member access — required for Next.js build-time inlining.
  const runtime = { NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL };
  const parsed = clientEnvSchema.safeParse(runtime);

  if (!parsed.success) {
    throw new Error(`Invalid client environment variables:\n${formatIssues(parsed.error)}`);
  }

  return parsed.data;
}

let serverEnvCache: ServerEnv | undefined;
let clientEnvCache: ClientEnv | undefined;

/** Validated server-only environment. Throws on the client or when invalid. */
export const serverEnv: ServerEnv = new Proxy({} as ServerEnv, {
  get(_target, prop: string) {
    serverEnvCache ??= parseServerEnv();
    return serverEnvCache[prop as keyof ServerEnv];
  },
});

/** Validated public environment. Safe to read from client components. */
export const clientEnv: ClientEnv = new Proxy({} as ClientEnv, {
  get(_target, prop: string) {
    clientEnvCache ??= parseClientEnv();
    return clientEnvCache[prop as keyof ClientEnv];
  },
});

/**
 * Fail fast at startup instead of on first request. Called from
 * `instrumentation.ts` so a misconfigured deployment never serves traffic.
 */
export function validateEnv(): void {
  if (shouldSkipValidation) return;

  const server = parseServerEnv();
  parseClientEnv();

  assertProductionServices(server);
}

/**
 * Services that may fall back in development must not fall back in production.
 *
 * The email and storage providers are optional so the app is testable without
 * credentials — but that convenience is a liability once deployed: the console
 * transport would swallow every password-reset link, and the local-disk provider
 * would write uploads onto an ephemeral container filesystem that vanishes on
 * the next deploy. Both fail silently, which is the worst way to fail. So in
 * production the configuration is required, and the server refuses to boot
 * without it.
 */
function assertProductionServices(server: ServerEnv): void {
  if (server.NODE_ENV !== 'production') return;

  const missing: string[] = [];

  if (!server.RESEND_API_KEY) missing.push('RESEND_API_KEY (emails would only be logged)');
  if (!server.EMAIL_FROM) missing.push('EMAIL_FROM (no sender address)');
  if (!server.S3_BUCKET) missing.push('S3_BUCKET (uploads would be written to ephemeral local disk)');

  if (missing.length > 0) {
    throw new Error(`Missing production configuration:\n${missing.map((item) => `  - ${item}`).join('\n')}`);
  }
}

export const isProduction = (): boolean => process.env.NODE_ENV === 'production';
export const isDevelopment = (): boolean => process.env.NODE_ENV === 'development';
export const isTest = (): boolean => process.env.NODE_ENV === 'test';

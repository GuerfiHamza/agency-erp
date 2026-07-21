import type { Instrumentation } from 'next';

/**
 * Runs once when the server process starts.
 *
 * Validating here means a misconfigured deployment fails at boot with a precise
 * message, instead of throwing on the first request that happens to touch an
 * unset variable.
 */
export async function register(): Promise<void> {
  // Only the Node.js runtime can read the full server environment.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { validateEnv } = await import('@/config/env');
  const { logger } = await import('@/lib/logger');

  validateEnv();
  logger.info('Environment validated', { runtime: process.env.NEXT_RUNTIME });
}

/**
 * Catches server errors Next itself surfaces (render, route, action, proxy)
 * that would otherwise only exist in stdout/stderr — routed through the same
 * structured logger everything else uses, so they show up in whatever log
 * aggregator reads this process's output. No external APM is configured, so
 * this is the whole "monitoring hook" for now; swap the body for a real
 * provider (Sentry, etc.) without touching any call site if one is added.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { logger } = await import('@/lib/logger');

  const message = error instanceof Error ? error.message : String(error);
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error ? String(error.digest) : undefined;

  logger.error('Unhandled request error', {
    message,
    digest,
    path: request.path,
    method: request.method,
    routeType: context.routeType,
    renderSource: context.renderSource,
  });
};

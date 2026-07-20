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

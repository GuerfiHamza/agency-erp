import { headers } from 'next/headers';

import { RateLimitError } from '@/lib/errors';

/**
 * In-memory rate limiting for unauthenticated, credential-sensitive Server
 * Actions (sign-in, password reset, invitation acceptance).
 *
 * This app runs as a single long-lived Node process on shared hosting — no
 * Redis, no multi-instance deploy behind a load balancer — so a process-local
 * `Map` is the right scope, not an abstraction over infrastructure that
 * doesn't exist here. A process restart resets every counter; that's
 * acceptable, restarts are rare and these limits exist to slow down
 * brute-forcing, not to be a perfectly durable ledger.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * The caller's IP from the reverse proxy's header. cPanel's Apache/Passenger
 * front end sets `x-forwarded-for`; `proxy.ts` never reaches this — it's read
 * fresh per action, same as everywhere else `headers()` is used in this app.
 */
export async function clientIp(): Promise<string> {
  const forwardedFor = (await headers()).get('x-forwarded-for');
  return forwardedFor?.split(',')[0]?.trim() || 'unknown';
}

/**
 * Fixed-window limiter: allows `limit` calls per `windowSeconds` for a given
 * `key`, then throws `RateLimitError` until the window resets. Buckets expire
 * lazily — the map only holds keys touched within their own window plus
 * whatever hasn't been swept by a later call to the same key, which is fine
 * at this app's traffic (an internal ERP, not a public site).
 */
export function assertWithinRateLimit(key: string, limit: number, windowSeconds: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return;
  }

  if (bucket.count >= limit) {
    throw new RateLimitError(undefined, Math.ceil((bucket.resetAt - now) / 1000));
  }

  bucket.count += 1;
}

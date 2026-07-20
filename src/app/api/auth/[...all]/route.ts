import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/lib/auth/auth';

/**
 * Better Auth catch-all endpoint. Every auth request (sign-in, sign-out,
 * callbacks, session reads) is handled here.
 */
export const { GET, POST } = toNextJsHandler(auth);

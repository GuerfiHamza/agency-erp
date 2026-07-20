'use client';

import { createAuthClient } from 'better-auth/react';

import { clientEnv } from '@/config/env';

/**
 * Better Auth browser client. Consumed by client components in Phase 3.
 */
export const authClient = createAuthClient({
  baseURL: clientEnv.NEXT_PUBLIC_APP_URL,
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;

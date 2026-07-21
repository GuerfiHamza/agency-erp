import { NextResponse } from 'next/server';

import { checkDatabaseConnection } from '@/db';

/**
 * Liveness/readiness endpoint for uptime monitors.
 *
 * Deliberately unauthenticated — `/api` is already excluded from `proxy.ts`'s
 * matcher, and this reveals nothing beyond "the process is up and can reach
 * its database", the same thing a monitor would learn by loading the sign-in
 * page, without needing to parse HTML to get it.
 */
export async function GET(): Promise<NextResponse> {
  const databaseOk = await checkDatabaseConnection();

  return NextResponse.json(
    { status: databaseOk ? 'ok' : 'degraded', database: databaseOk },
    { status: databaseOk ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

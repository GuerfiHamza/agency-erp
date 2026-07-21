import { NextResponse, type NextRequest } from 'next/server';

import { logger } from '@/lib/logger';
import * as portfolio from '@/modules/portfolio/portfolio.service';

import { authenticate } from './_lib/auth';

/** Published portfolio projects, for neodott.com. See `/dashboard/portfolio/settings` for the full docs. */
export async function GET(request: NextRequest): Promise<Response> {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;

  try {
    const projects = await portfolio.listPublicProjects(auth);
    return NextResponse.json(projects, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    logger.error('Failed to list public portfolio projects', { error });
    return NextResponse.json({ error: 'Failed to load projects.' }, { status: 500 });
  }
}

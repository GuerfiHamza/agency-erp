import { NextResponse, type NextRequest } from 'next/server';

import { isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import * as portfolio from '@/modules/portfolio/portfolio.service';

import { authenticate } from '../_lib/auth';

/** A single published project, by slug. */
export async function GET(
  request: NextRequest,
  context: RouteContext<'/api/public/portfolio/[slug]'>,
): Promise<Response> {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;

  const { slug } = await context.params;

  try {
    const project = await portfolio.getPublicProjectBySlug(auth, slug);
    return NextResponse.json(project, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    logger.error('Failed to load public portfolio project', { error, slug });
    return NextResponse.json({ error: 'Failed to load the project.' }, { status: 500 });
  }
}

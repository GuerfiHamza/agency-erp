'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';
import { logger } from '@/lib/logger';

/**
 * Catches what the page can throw — most realistically `NotFoundError` from
 * `getCompany`, when a session outlives the company it points at.
 *
 * The error object is deliberately not rendered. Next.js already redacts server
 * errors in production, but the digest is the only safe half; a message can
 * carry SQL. See `ErrorState`.
 */
export default function CompanySettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('Company settings page failed', { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <main className="p-gutter">
      <ErrorState
        title="Could not load company settings"
        description="Please try again. If it keeps happening, contact support."
        action={
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
        }
      />
    </main>
  );
}

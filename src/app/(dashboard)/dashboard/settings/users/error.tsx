'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';
import { logger } from '@/lib/logger';

/** The error object is never rendered — its message can carry SQL. */
export default function UsersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('Users page failed', { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <main className="p-gutter">
      <ErrorState
        title="Could not load people"
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

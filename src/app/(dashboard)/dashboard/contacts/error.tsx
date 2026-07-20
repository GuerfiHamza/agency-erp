'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';
import { logger } from '@/lib/logger';

/**
 * The error object is deliberately not rendered — a message can carry SQL, and
 * only the digest is safe to surface. See `ErrorState`.
 */
export default function ContactsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('Contacts page failed', { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <main className="p-gutter">
      <ErrorState
        title="Could not load contacts"
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

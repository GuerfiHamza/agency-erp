'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';
import { logger } from '@/lib/logger';

export default function SuppliersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('Suppliers page failed', { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <main className="p-gutter">
      <ErrorState
        title="Could not load suppliers"
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

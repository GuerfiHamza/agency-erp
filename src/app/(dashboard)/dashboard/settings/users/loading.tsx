import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/ui/states';

/** Shaped like the users table so the rows do not jump when they arrive. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-gutter">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="rounded-lg border border-border p-4">
        <TableSkeleton rows={8} columns={6} />
      </div>
    </div>
  );
}

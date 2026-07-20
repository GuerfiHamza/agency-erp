import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/ui/states';

/** Shaped like the roles page — a heading and a table — so content lands without a jump. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-gutter">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <TableSkeleton rows={5} columns={4} />
    </div>
  );
}

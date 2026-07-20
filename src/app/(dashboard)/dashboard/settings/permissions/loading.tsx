import { Skeleton } from '@/components/ui/skeleton';

/** Shaped like the permissions page — a heading and a grid of cards — so content lands without a jump. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-gutter">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
    </div>
  );
}

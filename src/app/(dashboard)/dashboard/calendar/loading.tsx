import { Skeleton } from '@/components/ui/skeleton';

/** Shaped like the calendar page — a heading, a toolbar, and a six-week grid. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-gutter">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-[36rem] w-full rounded-lg" />
    </div>
  );
}

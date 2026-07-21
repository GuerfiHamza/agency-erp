import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-gutter">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>

      <Skeleton className="h-32" />
      <Skeleton className="h-64" />
    </div>
  );
}

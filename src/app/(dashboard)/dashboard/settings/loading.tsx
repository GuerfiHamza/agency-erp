import { CardGridSkeleton } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-gutter">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>

      <CardGridSkeleton count={5} />
    </div>
  );
}

import { CardGridSkeleton } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="max-w-container-max mx-auto w-full space-y-gutter p-gutter">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <CardGridSkeleton count={4} />

      <div className="grid grid-cols-12 gap-gutter">
        <Skeleton className="col-span-12 h-96 rounded-2xl lg:col-span-8" />
        <Skeleton className="col-span-12 h-96 rounded-2xl lg:col-span-4" />
      </div>
    </div>
  );
}

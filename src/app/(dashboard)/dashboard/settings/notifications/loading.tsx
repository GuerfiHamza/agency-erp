import { Skeleton } from '@/components/ui/skeleton';
import { FormSkeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-gutter">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <FormSkeleton fields={6} />
    </div>
  );
}

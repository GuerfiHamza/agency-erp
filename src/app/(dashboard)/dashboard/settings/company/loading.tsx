import { FormSkeleton } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Shaped like the page it stands in for — four field groups, not a spinner.
 * A skeleton that matches the eventual layout stops the content jumping when it
 * lands. See MEMORY.md, "Reusable infrastructure".
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-gutter">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <FormSkeleton fields={4} />
      <FormSkeleton fields={3} />
    </div>
  );
}

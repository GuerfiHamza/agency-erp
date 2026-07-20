import type { LucideIcon } from 'lucide-react';
import { FileQuestion, Loader2, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * The four states every page owes its user: loading, empty, error, and the
 * content itself.
 *
 * They live together because they are one decision, not four: a page that
 * renders `<EmptyState>` for "no results" and a bare spinner for "loading" looks
 * like two different products. Consistency here is the point.
 *
 * These are Server Components — nothing below is interactive except the optional
 * action slot, which callers pass in.
 */

interface StateShellProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** `alert` for errors so assistive tech announces them. */
  role?: 'status' | 'alert';
}

function StateShell({ icon: Icon, title, description, action, className, role = 'status' }: StateShellProps) {
  return (
    <div
      role={role}
      className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}
    >
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * Nothing to show — and that is fine.
 *
 * Distinct from an error: an empty list is a normal state, and the copy should
 * offer the next step rather than apologise.
 */
export function EmptyState({
  icon = FileQuestion,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <StateShell icon={icon} title={title} description={description} action={action} className={className} />
  );
}

/**
 * Something went wrong.
 *
 * Takes a message rather than an error object: raw messages can carry SQL and
 * connection strings, so the caller decides what is safe to say — see
 * `toErrorPayload`.
 */
export function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again. If it keeps happening, contact support.',
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <StateShell
      icon={TriangleAlert}
      title={title}
      description={description}
      action={action}
      className={className}
      role="alert"
    />
  );
}

/** A centred spinner, for waits with no meaningful shape to skeleton. */
export function LoadingState({ label = 'Loading...', className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}
    >
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
      <span className="mt-3 text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * Skeleton shaped like a table.
 *
 * Prefer this over a spinner wherever the result's shape is known: matching the
 * eventual layout avoids the jolt of content replacing a spinner, and it makes
 * the wait feel shorter because the page appears to be assembling.
 */
export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading table">
      <div className="flex gap-4 border-b border-border pb-3">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 py-1">
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <Skeleton key={columnIndex} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Skeleton shaped like a form. */
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-5" role="status" aria-label="Loading form">
      {Array.from({ length: fields }).map((_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      <Skeleton className="h-9 w-32" />
    </div>
  );
}

/** Skeleton shaped like a grid of cards. */
export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="space-y-3 rounded-lg border border-border p-5">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Convenience for the common "empty list with a create button" case. */
export function EmptyStateAction({ children }: { children: React.ReactNode }) {
  return <Button size="sm">{children}</Button>;
}

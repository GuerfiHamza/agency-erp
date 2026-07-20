'use client';

import { Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Result } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Say what will happen, concretely. "Delete 3 invoices?" beats "Are you sure?". */
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red styling for destructive acts. */
  destructive?: boolean;
  /** Returns a Result; the dialog handles pending, error, and success. */
  onConfirm: () => Promise<Result<unknown>>;
  successMessage?: string;
}

/**
 * Confirmation for actions that are hard to undo.
 *
 * Built on AlertDialog rather than Dialog: it traps focus, cannot be dismissed
 * by clicking outside, and is announced as an alert — a destructive action
 * should not be one stray Escape away from happening or being missed.
 *
 * Confirming here is not authorisation. The Server Action behind `onConfirm`
 * must still check permissions; this dialog is a courtesy to the user, not a
 * security control.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  successMessage,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm(event: React.MouseEvent): void {
    // The dialog would otherwise close on click, tearing down the pending state
    // before the action resolves.
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await onConfirm();

      if (!result.success) {
        // Kept in the dialog rather than a toast: the failure belongs next to
        // the thing that failed, and the user may want to retry immediately.
        setError(result.error.message);
        return;
      }

      if (successMessage) toast.success(successMessage);
      onOpenChange(false);
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-flight would leave the action running with nothing
        // reporting its outcome.
        if (isPending) return;
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isPending}
            className={cn(destructive && buttonVariants({ variant: 'destructive' }))}
          >
            {isPending && <Loader2 className="animate-spin" aria-hidden />}
            {isPending ? 'Working...' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

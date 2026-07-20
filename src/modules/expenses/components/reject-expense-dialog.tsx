'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

import { rejectExpenseAction } from '../expenses.actions';

interface Props {
  expenseId: string;
  expenseDescription: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * A reason is required on the schema (`rejectExpenseSchema`), so this cannot
 * be the plain `ConfirmDialog` — it needs a field, not just a confirm click.
 */
export function RejectExpenseDialog({ expenseId, expenseDescription, open, onOpenChange }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  function onSubmit() {
    setError(null);

    startTransition(async () => {
      const result = await rejectExpenseAction({ expenseId, rejectionReason: reason });

      if (!result.success) {
        setError(result.error.message);
        return;
      }

      toast.success('Expense rejected.');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reject &ldquo;{expenseDescription}&rdquo;?</DialogTitle>
          <DialogDescription>Say why, so the person who submitted it knows what to fix.</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="rejection-reason">Reason</Label>
          <textarea
            id="rejection-reason"
            className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isPending}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onSubmit}
            disabled={isPending || !reason.trim()}
          >
            {isPending && <Loader2 className="animate-spin" aria-hidden />}
            {isPending ? 'Rejecting...' : 'Reject expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

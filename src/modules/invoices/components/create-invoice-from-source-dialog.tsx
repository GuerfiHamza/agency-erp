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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { createInvoiceFromProformaAction, createInvoiceFromQuoteAction } from '../invoices.actions';

interface Props {
  sourceKind: 'quote' | 'proforma';
  sourceId: string;
  sourceNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FALLBACK_PAYMENT_TERMS_DAYS = 30;

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * The one field an invoice needs that its source document doesn't have: a due
 * date. Everything else (client, contact, project, currency, notes, terms,
 * items) is copied server-side by `createInvoiceFromQuote`/`FromProforma`.
 */
export function CreateInvoiceFromSourceDialog({
  sourceKind,
  sourceId,
  sourceNumber,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState(() =>
    toDateInputValue(addDays(new Date(), FALLBACK_PAYMENT_TERMS_DAYS)),
  );

  function onSubmit() {
    setError(null);

    startTransition(async () => {
      const result =
        sourceKind === 'quote'
          ? await createInvoiceFromQuoteAction({ quoteId: sourceId, dueDate })
          : await createInvoiceFromProformaAction({ proformaInvoiceId: sourceId, dueDate });

      if (!result.success) {
        setError(result.error.message);
        return;
      }

      toast.success('Invoice created. Find it on the Invoices page.');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create invoice from {sourceNumber}</DialogTitle>
          <DialogDescription>
            Copies the client, items, and totals. Choose a due date to finish.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="invoice-due-date">Due date</Label>
          <Input
            id="invoice-due-date"
            type="date"
            value={dueDate}
            disabled={isPending}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={isPending || !dueDate}>
            {isPending && <Loader2 className="animate-spin" aria-hidden />}
            {isPending ? 'Creating...' : 'Create invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

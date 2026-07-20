'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { updatePaymentAction } from '../payments.actions';
import type { PaymentListItem } from '../payments.service';
import {
  PAYMENT_METHODS,
  paymentUpdateSchema,
  type PaymentUpdateFormValues,
  type PaymentUpdateInput,
} from '../payments.validation';

interface Props {
  payment: PaymentListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const METHOD_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  credit_card: 'Credit card',
  debit_card: 'Debit card',
  check: 'Check',
  paypal: 'PayPal',
  stripe: 'Stripe',
  other: 'Other',
};

function toDateInputValue(date: Date): string {
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * The amount, direction, and settled document are permanently locked once a
 * payment exists (see the validation module note) — this form only ever
 * touches the soft details: how it was paid, when, and any reference/notes.
 */
export function PaymentEditDialog({ payment, open, onOpenChange }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<PaymentUpdateFormValues, unknown, PaymentUpdateInput>({
    resolver: zodResolver(paymentUpdateSchema),
    defaultValues: {
      method: payment.method,
      paidAt: toDateInputValue(payment.paidAt),
      reference: payment.reference ?? '',
      notes: payment.notes ?? '',
    },
  });

  function onSubmit(values: PaymentUpdateInput) {
    setFormError(null);

    startTransition(async () => {
      const result = await updatePaymentAction({ paymentId: payment.id, ...values });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      toast.success('Payment updated.');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit payment</DialogTitle>
          <DialogDescription>
            {payment.amount} {payment.currency} — the amount and settled document cannot be changed here.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {formError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Method</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isPending}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PAYMENT_METHODS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {METHOD_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="paidAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paid at</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      disabled={isPending}
                      {...field}
                      value={field.value == null ? '' : String(field.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference</FormLabel>
                  <FormControl>
                    <Input disabled={isPending} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <textarea
                      className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isPending}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !form.formState.isDirty}>
                {isPending && <Loader2 className="animate-spin" aria-hidden />}
                {isPending ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

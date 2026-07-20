'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { useForm, type Control, type FieldPath } from 'react-hook-form';
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

import type { PayableInvoiceOption, PayablePurchaseOrderOption } from '../payments.repository';
import { createPaymentAction } from '../payments.actions';
import {
  CREATABLE_PAYMENT_STATUSES,
  PAYMENT_DIRECTIONS,
  PAYMENT_METHODS,
  paymentFormSchema,
  type PaymentFormValues,
  type PaymentInput,
} from '../payments.validation';

interface Props {
  payableInvoices: PayableInvoiceOption[];
  payablePurchaseOrders: PayablePurchaseOrderOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DIRECTION_LABELS: Record<(typeof PAYMENT_DIRECTIONS)[number], string> = {
  inbound: 'Inbound — received from a client',
  outbound: 'Outbound — paid to a supplier',
};

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

const STATUS_LABELS: Record<(typeof CREATABLE_PAYMENT_STATUSES)[number], string> = {
  pending: 'Pending — expected, not yet cleared',
  completed: 'Completed — the money has moved',
};

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function TextField({
  control,
  name,
  label,
  placeholder,
  type = 'text',
  disabled,
}: {
  control: Control<PaymentFormValues>;
  name: FieldPath<PaymentFormValues>;
  label: string;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type={type}
              placeholder={placeholder}
              disabled={disabled}
              {...field}
              value={field.value == null ? '' : String(field.value)}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * Create-only. There is no edit path for `direction`, `documentId`, or
 * `amount` — see the validation module note. `PaymentEditDialog` is the
 * separate, smaller form for the fields that stay editable after creation.
 */
export function PaymentFormDialog({ payableInvoices, payablePurchaseOrders, open, onOpenChange }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<PaymentFormValues, unknown, PaymentInput>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      direction: 'inbound',
      documentId: '',
      status: 'completed',
      method: 'bank_transfer',
      amount: '',
      exchangeRate: '',
      paidAt: toDateInputValue(new Date()),
      reference: '',
      notes: '',
    },
  });

  const direction = form.watch('direction');
  const documentId = form.watch('documentId');

  const documentOptions = direction === 'inbound' ? payableInvoices : payablePurchaseOrders;

  const selectedCurrency = useMemo(() => {
    if (direction === 'inbound') {
      return payableInvoices.find((invoice) => invoice.id === documentId)?.currency;
    }
    return payablePurchaseOrders.find((po) => po.id === documentId)?.currency;
  }, [direction, documentId, payableInvoices, payablePurchaseOrders]);

  function onDirectionChange(value: string) {
    form.setValue('direction', value as PaymentInput['direction']);
    form.setValue('documentId', '', { shouldValidate: false });
  }

  function onSubmit(values: PaymentInput) {
    setFormError(null);

    startTransition(async () => {
      const result = await createPaymentAction(values);

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      toast.success('Payment recorded.');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>Money that has moved, or is expected to.</DialogDescription>
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
              name="direction"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Direction</FormLabel>
                  <Select onValueChange={onDirectionChange} value={field.value} disabled={isPending}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PAYMENT_DIRECTIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {DIRECTION_LABELS[value]}
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
              name="documentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{direction === 'inbound' ? 'Invoice' : 'Purchase order'}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isPending}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={
                            direction === 'inbound'
                              ? 'Choose an invoice to settle'
                              : 'Choose a purchase order'
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {direction === 'inbound'
                        ? payableInvoices.map((invoice) => (
                            <SelectItem key={invoice.id} value={invoice.id}>
                              {invoice.number} — {invoice.clientName ?? 'Unknown client'}
                            </SelectItem>
                          ))
                        : payablePurchaseOrders.map((po) => (
                            <SelectItem key={po.id} value={po.id}>
                              {po.number} — {po.supplierName ?? 'Unknown supplier'}
                            </SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                  {documentOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {direction === 'inbound'
                        ? 'No invoices currently have an outstanding balance.'
                        : 'No purchase orders have been sent to a supplier yet.'}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                control={form.control}
                name="amount"
                label={selectedCurrency ? `Amount (${selectedCurrency})` : 'Amount'}
                placeholder="0.00"
                disabled={isPending}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isPending}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CREATABLE_PAYMENT_STATUSES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {STATUS_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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

              <TextField
                control={form.control}
                name="paidAt"
                label="Paid at"
                type="date"
                disabled={isPending}
              />
            </div>

            <TextField
              control={form.control}
              name="exchangeRate"
              label="Exchange rate (optional)"
              placeholder="1.0000"
              disabled={isPending}
            />

            <TextField control={form.control} name="reference" label="Reference" disabled={isPending} />

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
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="animate-spin" aria-hidden />}
                {isPending ? 'Saving...' : 'Record payment'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

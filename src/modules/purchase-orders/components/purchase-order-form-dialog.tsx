'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useFieldArray, useForm, type Control, type FieldPath } from 'react-hook-form';
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
import { CreatableSelectField } from '@/components/shared/creatable-select';

import { quickCreateProjectAction } from '../../projects/projects.actions';
import { quickCreateSupplierAction } from '../../suppliers/suppliers.actions';
import { createPurchaseOrderAction, updatePurchaseOrderAction } from '../purchase-orders.actions';
import type { PurchaseOrderWithItems } from '../purchase-orders.service';
import {
  purchaseOrderFormSchema,
  type PurchaseOrderFormValues,
  type PurchaseOrderInput,
} from '../purchase-orders.validation';

interface Props {
  /** Omitted or null → create; a purchase order → edit. Edit only ever reaches a draft — the table hides it otherwise. */
  purchaseOrder?: PurchaseOrderWithItems | null;
  supplierOptions: { id: string; name: string; paymentTermsDays: number | null }[];
  projectOptions: { id: string; name: string }[];
  defaultCurrency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const UNASSIGNED = '__none__';
const FALLBACK_PAYMENT_TERMS_DAYS = 30;

const BLANK_ITEM = { description: '', quantity: '1', unitPrice: '0.00', discountPercent: '0', taxRate: '0' };

function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return '';
  return new Date(date).toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Preview only — the server recomputes every total from scratch via `@/lib/money`. */
function previewLineTotal(item: {
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxRate: string;
}) {
  const gross = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
  const afterDiscount = gross * (1 - (Number(item.discountPercent) || 0) / 100);
  const total = afterDiscount * (1 + (Number(item.taxRate) || 0) / 100);
  return Number.isFinite(total) ? total.toFixed(2) : '0.00';
}

function TextField({
  control,
  name,
  label,
  placeholder,
  type = 'text',
  disabled,
}: {
  control: Control<PurchaseOrderFormValues>;
  name: FieldPath<PurchaseOrderFormValues>;
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

export function PurchaseOrderFormDialog({
  purchaseOrder,
  supplierOptions,
  projectOptions,
  defaultCurrency,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(purchaseOrder);

  const form = useForm<PurchaseOrderFormValues, unknown, PurchaseOrderInput>({
    resolver: zodResolver(purchaseOrderFormSchema),
    defaultValues: {
      supplierId: purchaseOrder?.supplierId ?? '',
      projectId: purchaseOrder?.projectId ?? '',
      title: purchaseOrder?.title ?? '',
      issueDate: toDateInputValue(purchaseOrder?.issueDate) || toDateInputValue(new Date()),
      expectedDate:
        toDateInputValue(purchaseOrder?.expectedDate) ||
        toDateInputValue(addDays(new Date(), FALLBACK_PAYMENT_TERMS_DAYS)),
      currency: purchaseOrder?.currency ?? defaultCurrency,
      notes: purchaseOrder?.notes ?? '',
      terms: purchaseOrder?.terms ?? '',
      items: purchaseOrder
        ? purchaseOrder.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent,
            taxRate: item.taxRate,
          }))
        : [BLANK_ITEM],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });
  const items = form.watch('items');

  const totals = items.reduce(
    (acc, item) => {
      const gross = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
      const discount = gross * ((Number(item.discountPercent) || 0) / 100);
      const afterDiscount = gross - discount;
      const tax = afterDiscount * ((Number(item.taxRate) || 0) / 100);
      return { subtotal: acc.subtotal + gross, discount: acc.discount + discount, tax: acc.tax + tax };
    },
    { subtotal: 0, discount: 0, tax: 0 },
  );
  const grandTotal = totals.subtotal - totals.discount + totals.tax;

  /** New purchase order only: picking a supplier recomputes the expected date from its payment terms (or the 30-day fallback). */
  function onSupplierChange(value: string) {
    if (isEdit) return;

    const supplier = supplierOptions.find((option) => option.id === value);
    const termsDays = supplier?.paymentTermsDays ?? FALLBACK_PAYMENT_TERMS_DAYS;
    const issueDateValue = String(form.getValues('issueDate') ?? '');
    const issueDate = issueDateValue ? new Date(issueDateValue) : new Date();

    form.setValue('expectedDate', toDateInputValue(addDays(issueDate, termsDays)), { shouldValidate: false });
  }

  function onSubmit(values: PurchaseOrderInput) {
    setFormError(null);

    startTransition(async () => {
      const result = isEdit
        ? await updatePurchaseOrderAction({ purchaseOrderId: purchaseOrder!.id, ...values })
        : await createPurchaseOrderAction(values);

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      toast.success(isEdit ? 'Purchase order updated.' : 'Purchase order created.');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${purchaseOrder!.number}` : 'New purchase order'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this draft purchase order.' : 'Order stock or services from a supplier.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {formError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="supplierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier</FormLabel>
                    <FormControl>
                      <CreatableSelectField
                        value={field.value}
                        onChange={(value) => {
                          field.onChange(value);
                          onSupplierChange(value);
                        }}
                        options={supplierOptions}
                        placeholder="Choose a supplier"
                        disabled={isPending || isEdit}
                        createLabel="New supplier"
                        dialogTitle="New supplier"
                        dialogLabel="Supplier name"
                        onQuickCreate={(name) => quickCreateSupplierAction({ name })}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <TextField control={form.control} name="title" label="Title" disabled={isPending} />
            </div>

            <FormField
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project</FormLabel>
                  <FormControl>
                    <CreatableSelectField
                      value={field.value ? String(field.value) : UNASSIGNED}
                      onChange={(value) => field.onChange(value === UNASSIGNED ? '' : value)}
                      options={[{ id: UNASSIGNED, name: 'None' }, ...projectOptions]}
                      disabled={isPending}
                      triggerClassName="sm:w-1/2"
                      createLabel="New project"
                      dialogTitle="New project"
                      dialogLabel="Project name"
                      onQuickCreate={(name) => quickCreateProjectAction({ name })}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <TextField
                control={form.control}
                name="issueDate"
                label="Issue date"
                type="date"
                disabled={isPending}
              />
              <TextField
                control={form.control}
                name="expectedDate"
                label="Expected date"
                type="date"
                disabled={isPending}
              />
              <TextField control={form.control} name="currency" label="Currency" disabled={isPending} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FormLabel>Line items</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => append(BLANK_ITEM)}
                >
                  <Plus aria-hidden />
                  Add line
                </Button>
              </div>

              <div className="space-y-3 rounded-lg border border-border p-3">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="grid items-start gap-2 sm:grid-cols-[1fr_repeat(4,7rem)_2rem]"
                  >
                    <FormField
                      control={form.control}
                      name={`items.${index}.description`}
                      render={({ field: itemField }) => (
                        <FormItem>
                          {index === 0 && <FormLabel className="text-xs">Description</FormLabel>}
                          <FormControl>
                            <Input disabled={isPending} {...itemField} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.quantity`}
                      render={({ field: itemField }) => (
                        <FormItem>
                          {index === 0 && <FormLabel className="text-xs">Qty</FormLabel>}
                          <FormControl>
                            <Input disabled={isPending} {...itemField} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.unitPrice`}
                      render={({ field: itemField }) => (
                        <FormItem>
                          {index === 0 && <FormLabel className="text-xs">Unit price</FormLabel>}
                          <FormControl>
                            <Input disabled={isPending} {...itemField} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.discountPercent`}
                      render={({ field: itemField }) => (
                        <FormItem>
                          {index === 0 && <FormLabel className="text-xs">Disc %</FormLabel>}
                          <FormControl>
                            <Input disabled={isPending} {...itemField} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.taxRate`}
                      render={({ field: itemField }) => (
                        <FormItem>
                          {index === 0 && <FormLabel className="text-xs">Tax %</FormLabel>}
                          <FormControl>
                            <Input disabled={isPending} {...itemField} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={index === 0 ? 'mt-6 size-8' : 'size-8'}
                      disabled={isPending || fields.length === 1}
                      onClick={() => remove(index)}
                      aria-label="Remove line"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>

                    <p className="text-xs text-muted-foreground sm:col-span-full sm:text-right">
                      Line total: {previewLineTotal(items[index] ?? BLANK_ITEM)} {form.watch('currency')}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex justify-end text-sm">
                <div className="w-56 space-y-1">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{totals.subtotal.toFixed(2)}</span>
                  </div>
                  {totals.discount !== 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Discount</span>
                      <span>-{totals.discount.toFixed(2)}</span>
                    </div>
                  )}
                  {totals.tax !== 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Tax</span>
                      <span>{totals.tax.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold">
                    <span>Total</span>
                    <span>
                      {grandTotal.toFixed(2)} {form.watch('currency')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

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

            <FormField
              control={form.control}
              name="terms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Terms</FormLabel>
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
              <Button type="submit" disabled={isPending || (isEdit && !form.formState.isDirty)}>
                {isPending && <Loader2 className="animate-spin" aria-hidden />}
                {isPending ? 'Saving...' : isEdit ? 'Save' : 'Create purchase order'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
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

import { createSupplierAction, updateSupplierAction } from '../suppliers.actions';
import type { SupplierRow } from '../suppliers.service';
import {
  SUPPLIER_STATUSES,
  supplierFormSchema,
  type SupplierFormValues,
  type SupplierInput,
} from '../suppliers.validation';

interface Props {
  /** Omitted or null → create; a supplier → edit. One form for both. */
  supplier?: SupplierRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A simple text control, so the fields below are not each a copy of the same JSX. */
function TextField({
  control,
  name,
  label,
  placeholder,
  type = 'text',
  disabled,
}: {
  control: Control<SupplierFormValues>;
  name: FieldPath<SupplierFormValues>;
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

const STATUS_LABELS: Record<(typeof SUPPLIER_STATUSES)[number], string> = {
  active: 'Active',
  inactive: 'Inactive',
  archived: 'Archived',
};

export function SupplierFormDialog({ supplier, open, onOpenChange }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(supplier);

  const form = useForm<SupplierFormValues, unknown, SupplierInput>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: {
      name: supplier?.name ?? '',
      status: supplier?.status ?? 'active',
      legalName: supplier?.legalName ?? '',
      taxId: supplier?.taxId ?? '',
      email: supplier?.email ?? '',
      phone: supplier?.phone ?? '',
      website: supplier?.website ?? '',
      contactName: supplier?.contactName ?? '',
      addressLine1: supplier?.addressLine1 ?? '',
      addressLine2: supplier?.addressLine2 ?? '',
      city: supplier?.city ?? '',
      state: supplier?.state ?? '',
      postalCode: supplier?.postalCode ?? '',
      country: supplier?.country ?? '',
      currency: supplier?.currency ?? '',
      paymentTermsDays: supplier?.paymentTermsDays ?? '',
      notes: supplier?.notes ?? '',
    },
  });

  function onSubmit(values: SupplierInput) {
    setFormError(null);

    startTransition(async () => {
      const result = isEdit
        ? await updateSupplierAction({ supplierId: supplier!.id, ...values })
        : await createSupplierAction(values);

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      toast.success(isEdit ? 'Supplier updated.' : 'Supplier created.');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${supplier!.name}` : 'New supplier'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this supplier’s details.' : 'Add a supplier to this workspace.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {formError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <TextField control={form.control} name="name" label="Name" disabled={isPending} />

            <div className="grid gap-4 sm:grid-cols-2">
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
                        {SUPPLIER_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {STATUS_LABELS[status]}
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
                name="contactName"
                label="Contact name"
                disabled={isPending}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                control={form.control}
                name="email"
                label="Email"
                type="email"
                placeholder="hello@supplier.com"
                disabled={isPending}
              />
              <TextField control={form.control} name="phone" label="Phone" type="tel" disabled={isPending} />
            </div>

            <TextField
              control={form.control}
              name="website"
              label="Website"
              type="url"
              placeholder="https://supplier.com"
              disabled={isPending}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="legalName" label="Legal name" disabled={isPending} />
              <TextField control={form.control} name="taxId" label="Tax ID" disabled={isPending} />
            </div>

            <TextField
              control={form.control}
              name="addressLine1"
              label="Address line 1"
              disabled={isPending}
            />
            <TextField
              control={form.control}
              name="addressLine2"
              label="Address line 2"
              disabled={isPending}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="city" label="City" disabled={isPending} />
              <TextField control={form.control} name="state" label="State / Province" disabled={isPending} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <TextField control={form.control} name="postalCode" label="Postal code" disabled={isPending} />
              <TextField
                control={form.control}
                name="country"
                label="Country"
                placeholder="FR"
                disabled={isPending}
              />
              <TextField
                control={form.control}
                name="currency"
                label="Currency"
                placeholder="EUR"
                disabled={isPending}
              />
            </div>

            <TextField
              control={form.control}
              name="paymentTermsDays"
              label="Payment terms they grant us (days)"
              type="number"
              placeholder="30"
              disabled={isPending}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <textarea
                      className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
                {isPending ? 'Saving...' : isEdit ? 'Save' : 'Create supplier'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

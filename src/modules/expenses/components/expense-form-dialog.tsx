'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import { useForm, type Control, type FieldPath } from 'react-hook-form';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { CreatableSelectField } from '@/components/shared/creatable-select';
import { FileUpload, type UploadedFile } from '@/modules/storage/components/file-upload';

import { quickCreateProjectAction } from '../../projects/projects.actions';
import { quickCreateSupplierAction } from '../../suppliers/suppliers.actions';
import { createExpenseAction, updateExpenseAction } from '../expenses.actions';
import type { ExpenseListItem } from '../expenses.service';
import {
  EXPENSE_CATEGORIES,
  expenseCreateSchema,
  expenseDetailsSchema,
  type ExpenseCreateInput,
  type ExpenseDetailsInput,
  type ExpenseDetailsValues,
} from '../expenses.validation';

interface Props {
  /** Omitted or null → create; an expense → edit. Edit only ever reaches a draft — the table hides it otherwise. */
  expense?: ExpenseListItem | null;
  currentUserId: string;
  defaultCurrency: string;
  projectOptions: { id: string; name: string }[];
  supplierOptions: { id: string; name: string }[];
  userOptions: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NONE = '__none__';

const CATEGORY_LABELS: Record<(typeof EXPENSE_CATEGORIES)[number], string> = {
  travel: 'Travel',
  meals: 'Meals',
  software: 'Software',
  hardware: 'Hardware',
  office: 'Office',
  marketing: 'Marketing',
  subcontractor: 'Subcontractor',
  utilities: 'Utilities',
  other: 'Other',
};

function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return '';
  return new Date(date).toISOString().slice(0, 10);
}

function TextField({
  control,
  name,
  label,
  placeholder,
  type = 'text',
  disabled,
}: {
  control: Control<ExpenseDetailsValues>;
  name: FieldPath<ExpenseDetailsValues>;
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
 * One dialog for create and edit. The receipt upload only appears on create —
 * same posture as Documents: an already-submitted expense's receipt is never
 * replaced, so the edit form simply omits the dropzone.
 */
export function ExpenseFormDialog({
  expense,
  currentUserId,
  defaultCurrency,
  projectOptions,
  supplierOptions,
  userOptions,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);
  const isEdit = Boolean(expense);

  const form = useForm<ExpenseDetailsValues, unknown, ExpenseDetailsInput>({
    resolver: zodResolver(isEdit ? expenseDetailsSchema : expenseCreateSchema),
    defaultValues: {
      description: expense?.description ?? '',
      category: expense?.category ?? 'other',
      amount: expense?.amount ?? '',
      taxAmount: expense?.taxAmount ?? '0',
      currency: expense?.currency ?? defaultCurrency,
      spentOn: toDateInputValue(expense?.spentOn) || toDateInputValue(new Date()),
      billable: expense?.billable ?? false,
      projectId: expense?.projectId ?? '',
      supplierId: expense?.supplierId ?? '',
      userId: expense?.userId ?? currentUserId,
    },
  });

  const billable = form.watch('billable');

  const onUploaded = useCallback((file: UploadedFile) => setUploaded(file), []);

  function onSubmit(values: ExpenseDetailsInput) {
    setFormError(null);

    startTransition(async () => {
      const result = isEdit
        ? await updateExpenseAction({ expenseId: expense!.id, ...values })
        : await createExpenseAction({
            ...values,
            receiptStorageKey: uploaded?.key ?? null,
          } satisfies ExpenseCreateInput);

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      toast.success(isEdit ? 'Expense updated.' : 'Expense recorded.');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit expense' : 'New expense'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this draft expense.' : 'Record a cost you or the company incurred.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {formError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            {!isEdit && <FileUpload scope="receipts" onUploaded={onUploaded} disabled={isPending} />}

            <TextField control={form.control} name="description" label="Description" disabled={isPending} />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isPending}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {CATEGORY_LABELS[category]}
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
                name="spentOn"
                label="Spent on"
                type="date"
                disabled={isPending}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <TextField
                control={form.control}
                name="amount"
                label="Amount"
                placeholder="0.00"
                disabled={isPending}
              />
              <TextField
                control={form.control}
                name="taxAmount"
                label="Tax amount"
                placeholder="0.00"
                disabled={isPending}
              />
              <TextField control={form.control} name="currency" label="Currency" disabled={isPending} />
            </div>

            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Incurred by</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isPending}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose who incurred this" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {userOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
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
              name="supplierId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Supplier</FormLabel>
                  <FormControl>
                    <CreatableSelectField
                      value={field.value ? String(field.value) : NONE}
                      onChange={(value) => field.onChange(value === NONE ? '' : value)}
                      options={[{ id: NONE, name: 'None' }, ...supplierOptions]}
                      disabled={isPending}
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

            <FormField
              control={form.control}
              name="billable"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormLabel className="font-normal">Billable to a client</FormLabel>
                </FormItem>
              )}
            />

            {billable && (
              <FormField
                control={form.control}
                name="projectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project</FormLabel>
                    <FormControl>
                      <CreatableSelectField
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        options={projectOptions}
                        placeholder="Choose the project to bill"
                        disabled={isPending}
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
            )}

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
                {isPending ? 'Saving...' : isEdit ? 'Save' : 'Add expense'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

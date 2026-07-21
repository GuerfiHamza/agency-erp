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

import { createClientAction, updateClientAction } from '../clients.actions';
import type { ClientListItem } from '../clients.service';
import {
  clientFormSchema,
  CLIENT_STATUSES,
  CLIENT_TYPES,
  type ClientFormValues,
  type ClientInput,
} from '../clients.validation';

interface Props {
  /** Omitted or null → create; a client → edit. One form for both. */
  client?: ClientListItem | null;
  ownerOptions: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A simple text control, so the fifteen fields below are not fifteen copies of the same JSX. */
function TextField({
  control,
  name,
  label,
  placeholder,
  type = 'text',
  disabled,
}: {
  control: Control<ClientFormValues>;
  name: FieldPath<ClientFormValues>;
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

const STATUS_LABELS: Record<(typeof CLIENT_STATUSES)[number], string> = {
  prospect: 'Prospect',
  active: 'Active',
  inactive: 'Inactive',
  archived: 'Archived',
};

const UNASSIGNED = '__none__';

export function ClientFormDialog({ client, ownerOptions, open, onOpenChange }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(client);

  const form = useForm<ClientFormValues, unknown, ClientInput>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      name: client?.name ?? '',
      type: client?.type ?? 'company',
      status: client?.status ?? 'prospect',
      legalName: client?.legalName ?? '',
      taxId: client?.taxId ?? '',
      registrationNumber: client?.registrationNumber ?? '',
      nif: client?.nif ?? '',
      nis: client?.nis ?? '',
      articleNumber: client?.articleNumber ?? '',
      email: client?.email ?? '',
      phone: client?.phone ?? '',
      website: client?.website ?? '',
      addressLine1: client?.addressLine1 ?? '',
      addressLine2: client?.addressLine2 ?? '',
      city: client?.city ?? '',
      state: client?.state ?? '',
      postalCode: client?.postalCode ?? '',
      country: client?.country ?? '',
      currency: client?.currency ?? '',
      paymentTermsDays: client?.paymentTermsDays ?? '',
      ownerId: client?.ownerId ?? '',
      notes: client?.notes ?? '',
    },
  });

  // Same tolerated `react-hooks/incompatible-library` warning as Opportunities' lostReason
  // (form.watch() cannot be memoized by the React Compiler).
  const isCompany = form.watch('type') === 'company';

  function onSubmit(values: ClientInput) {
    setFormError(null);

    startTransition(async () => {
      const result = isEdit
        ? await updateClientAction({ clientId: client!.id, ...values })
        : await createClientAction(values);

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      toast.success(isEdit ? 'Client updated.' : 'Client created.');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${client!.name}` : 'New client'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this client’s details.' : 'Add a client to this workspace.'}
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

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isPending}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CLIENT_TYPES.map((type) => (
                          <SelectItem key={type} value={type} className="capitalize">
                            {type}
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
                        {CLIENT_STATUSES.map((status) => (
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

              <FormField
                control={form.control}
                name="ownerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account manager</FormLabel>
                    <Select
                      // The Select cannot hold '' as a value, so map the empty
                      // "unassigned" choice to a sentinel and back.
                      onValueChange={(value) => field.onChange(value === UNASSIGNED ? '' : value)}
                      value={field.value ? String(field.value) : UNASSIGNED}
                      disabled={isPending}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                        {ownerOptions.map((owner) => (
                          <SelectItem key={owner.id} value={owner.id}>
                            {owner.name}
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
              <TextField
                control={form.control}
                name="email"
                label="Email"
                type="email"
                placeholder="hello@client.com"
                disabled={isPending}
              />
              <TextField control={form.control} name="phone" label="Phone" type="tel" disabled={isPending} />
            </div>

            <TextField
              control={form.control}
              name="website"
              label="Website"
              type="url"
              placeholder="https://client.com"
              disabled={isPending}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="legalName" label="Legal name" disabled={isPending} />
              <TextField control={form.control} name="taxId" label="Tax ID" disabled={isPending} />
            </div>

            {isCompany && (
              <div className="grid gap-4 rounded-md border border-dashed p-4 sm:grid-cols-2">
                <TextField
                  control={form.control}
                  name="registrationNumber"
                  label="RC (N° d'immatriculation)"
                  disabled={isPending}
                />
                <TextField control={form.control} name="nif" label="NIF" disabled={isPending} />
                <TextField control={form.control} name="nis" label="NIS" disabled={isPending} />
                <TextField
                  control={form.control}
                  name="articleNumber"
                  label="N° Article (AI)"
                  disabled={isPending}
                />
              </div>
            )}

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
              label="Payment terms (days)"
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
                {isPending ? 'Saving...' : isEdit ? 'Save' : 'Create client'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

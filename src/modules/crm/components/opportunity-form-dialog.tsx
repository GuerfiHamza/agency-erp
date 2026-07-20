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
import { CreatableSelectField } from '@/components/shared/creatable-select';

import { quickCreateClientAction } from '../../clients/clients.actions';
import { createOpportunityAction, updateOpportunityAction } from '../opportunities.actions';
import type { OpportunityListItem } from '../opportunities.service';
import {
  opportunityFormSchema,
  OPPORTUNITY_STAGES,
  type OpportunityFormValues,
  type OpportunityInput,
} from '../opportunities.validation';

interface Props {
  /** Omitted or null → create; an opportunity → edit. One form for both. */
  opportunity?: OpportunityListItem | null;
  clientOptions: { id: string; name: string }[];
  ownerOptions: { id: string; name: string }[];
  /** Contacts keyed by client id — the contact picker filters to the chosen client. */
  contactsByClient: Record<string, { id: string; name: string }[]>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function humanise(value: string): string {
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A Date to the `YYYY-MM-DD` a native date input expects. */
function toDateInputValue(date: Date | null): string {
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
  control: Control<OpportunityFormValues>;
  name: FieldPath<OpportunityFormValues>;
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

const UNASSIGNED = '__none__';

export function OpportunityFormDialog({
  opportunity,
  clientOptions,
  ownerOptions,
  contactsByClient,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(opportunity);

  const form = useForm<OpportunityFormValues, unknown, OpportunityInput>({
    resolver: zodResolver(opportunityFormSchema),
    defaultValues: {
      name: opportunity?.name ?? '',
      clientId: opportunity?.clientId ?? '',
      contactId: opportunity?.contactId ?? '',
      stage: opportunity?.stage ?? 'discovery',
      value: opportunity?.value ?? '',
      currency: opportunity?.currency ?? '',
      probability: opportunity?.probability ?? '',
      expectedCloseDate: toDateInputValue(opportunity?.expectedCloseDate ?? null),
      lostReason: opportunity?.lostReason ?? '',
      ownerId: opportunity?.ownerId ?? '',
    },
  });

  const stage = form.watch('stage');
  const clientId = form.watch('clientId');
  const contactsForClient = contactsByClient[clientId] ?? [];

  function onSubmit(values: OpportunityInput) {
    setFormError(null);

    startTransition(async () => {
      const result = isEdit
        ? await updateOpportunityAction({ opportunityId: opportunity!.id, ...values })
        : await createOpportunityAction(values);

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      toast.success(isEdit ? 'Opportunity updated.' : 'Opportunity created.');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${opportunity!.name}` : 'New opportunity'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this deal.' : 'Track a qualified deal through your pipeline.'}
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

            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client</FormLabel>
                  <FormControl>
                    <CreatableSelectField
                      value={field.value}
                      onChange={(value) => {
                        field.onChange(value);
                        // The old contact belonged to the old client — clear it.
                        form.setValue('contactId', '', { shouldValidate: false });
                      }}
                      options={clientOptions}
                      placeholder="Choose a client"
                      disabled={isPending}
                      createLabel="New client"
                      dialogTitle="New client"
                      dialogLabel="Client name"
                      onQuickCreate={(name) => quickCreateClientAction({ name })}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Only meaningful once a client is chosen and that client has contacts. */}
            {clientId && contactsForClient.length > 0 && (
              <FormField
                control={form.control}
                name="contactId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primary contact</FormLabel>
                    <Select
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
                        <SelectItem value={UNASSIGNED}>None</SelectItem>
                        {contactsForClient.map((contact) => (
                          <SelectItem key={contact.id} value={contact.id}>
                            {contact.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="stage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stage</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isPending}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {OPPORTUNITY_STAGES.map((stageOption) => (
                          <SelectItem key={stageOption} value={stageOption}>
                            {humanise(stageOption)}
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
                name="probability"
                label="Probability %"
                type="number"
                placeholder="50"
                disabled={isPending}
              />

              <FormField
                control={form.control}
                name="ownerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Owner</FormLabel>
                    <Select
                      // Radix Select cannot hold '' as a value; map "unassigned" to a sentinel.
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

            <div className="grid gap-4 sm:grid-cols-3">
              <TextField
                control={form.control}
                name="value"
                label="Value"
                placeholder="10000.00"
                disabled={isPending}
              />
              <TextField
                control={form.control}
                name="currency"
                label="Currency"
                placeholder="EUR"
                disabled={isPending}
              />
              <TextField
                control={form.control}
                name="expectedCloseDate"
                label="Expected close"
                type="date"
                disabled={isPending}
              />
            </div>

            {/* Only asked for when the deal is lost — the field is meaningless otherwise. */}
            {stage === 'lost' && (
              <FormField
                control={form.control}
                name="lostReason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason lost</FormLabel>
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
                {isPending ? 'Saving...' : isEdit ? 'Save' : 'Create opportunity'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

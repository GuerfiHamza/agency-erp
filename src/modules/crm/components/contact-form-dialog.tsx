'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
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
import { CreatableSelectField } from '@/components/shared/creatable-select';

import { quickCreateClientAction } from '../../clients/clients.actions';
import { createContactAction, updateContactAction } from '../contacts.actions';
import type { ContactListItem } from '../contacts.service';
import { contactFormSchema, type ContactFormValues, type ContactInput } from '../contacts.validation';

interface Props {
  /** Omitted or null → create; a contact → edit. One form for both. */
  contact?: ContactListItem | null;
  clientOptions: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function TextField({
  control,
  name,
  label,
  placeholder,
  type = 'text',
  disabled,
}: {
  control: Control<ContactFormValues>;
  name: FieldPath<ContactFormValues>;
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

export function ContactFormDialog({ contact, clientOptions, open, onOpenChange }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(contact);

  const form = useForm<ContactFormValues, unknown, ContactInput>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      clientId: contact?.clientId ?? '',
      firstName: contact?.firstName ?? '',
      lastName: contact?.lastName ?? '',
      email: contact?.email ?? '',
      phone: contact?.phone ?? '',
      mobile: contact?.mobile ?? '',
      jobTitle: contact?.jobTitle ?? '',
      isPrimary: contact?.isPrimary ?? false,
      notes: contact?.notes ?? '',
    },
  });

  function onSubmit(values: ContactInput) {
    setFormError(null);

    startTransition(async () => {
      const result = isEdit
        ? await updateContactAction({ contactId: contact!.id, ...values })
        : await createContactAction(values);

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      toast.success(isEdit ? 'Contact updated.' : 'Contact created.');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Edit ${contact!.firstName} ${contact!.lastName ?? ''}`.trim() : 'New contact'}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this contact.' : 'Add a person at one of your clients.'}
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
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client</FormLabel>
                  <FormControl>
                    <CreatableSelectField
                      value={field.value}
                      onChange={field.onChange}
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

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="firstName" label="First name" disabled={isPending} />
              <TextField control={form.control} name="lastName" label="Last name" disabled={isPending} />
            </div>

            <TextField
              control={form.control}
              name="jobTitle"
              label="Job title"
              placeholder="Marketing Director"
              disabled={isPending}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <TextField
                control={form.control}
                name="email"
                label="Email"
                type="email"
                placeholder="person@client.com"
                disabled={isPending}
              />
              <TextField control={form.control} name="phone" label="Phone" type="tel" disabled={isPending} />
              <TextField
                control={form.control}
                name="mobile"
                label="Mobile"
                type="tel"
                disabled={isPending}
              />
            </div>

            <FormField
              control={form.control}
              name="isPrimary"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormLabel className="font-normal">
                    Primary contact — the default recipient for this client’s documents
                  </FormLabel>
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
                {isPending ? 'Saving...' : isEdit ? 'Save' : 'Create contact'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

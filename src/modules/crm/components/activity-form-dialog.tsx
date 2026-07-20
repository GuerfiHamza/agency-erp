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
import { CreatableSelectField } from '@/components/shared/creatable-select';

import { quickCreateClientAction } from '../../clients/clients.actions';
import { createActivityAction, updateActivityAction } from '../activities.actions';
import type { ActivityListItem } from '../activities.service';
import {
  activityFormSchema,
  ACTIVITY_TYPES,
  RELATED_KINDS,
  type ActivityFormValues,
  type ActivityInput,
  type RelatedKind,
} from '../activities.validation';

type Option = { id: string; name: string };

interface Props {
  /** Omitted or null → create; an activity → edit. One form for both. */
  activity?: ActivityListItem | null;
  linkOptions: { leads: Option[]; clients: Option[]; opportunities: Option[] };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function humanise(value: string): string {
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A Date to the `YYYY-MM-DDTHH:mm` a native datetime-local input expects, in local time. */
function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const KIND_LABEL: Record<RelatedKind, string> = {
  none: 'Nothing',
  lead: 'Lead',
  client: 'Client',
  opportunity: 'Opportunity',
};

export function ActivityFormDialog({ activity, linkOptions, open, onOpenChange }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(activity);

  const form = useForm<ActivityFormValues, unknown, ActivityInput>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: {
      type: activity?.type ?? 'note',
      subject: activity?.subject ?? '',
      body: activity?.body ?? '',
      occurredAt: toDateTimeLocal(activity?.occurredAt ? new Date(activity.occurredAt) : new Date()),
      relatedKind: activity?.relatedKind ?? 'none',
      relatedId: activity?.leadId ?? activity?.clientId ?? activity?.opportunityId ?? '',
    },
  });

  const relatedKind = form.watch('relatedKind');
  const targets =
    relatedKind === 'lead'
      ? linkOptions.leads
      : relatedKind === 'client'
        ? linkOptions.clients
        : relatedKind === 'opportunity'
          ? linkOptions.opportunities
          : [];

  function onSubmit(values: ActivityInput) {
    setFormError(null);

    startTransition(async () => {
      const result = isEdit
        ? await updateActivityAction({ activityId: activity!.id, ...values })
        : await createActivityAction(values);

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      toast.success(isEdit ? 'Activity updated.' : 'Activity logged.');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit activity' : 'Log activity'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this logged interaction.' : 'Record a call, email, meeting, or note.'}
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
                        {ACTIVITY_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {humanise(type)}
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
                name="occurredAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>When</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        disabled={isPending}
                        {...field}
                        value={typeof field.value === 'string' ? field.value : ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <FormControl>
                    <Input placeholder="Kickoff call" disabled={isPending} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="relatedKind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Related to</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        // Switching what it links to invalidates the chosen record.
                        form.setValue('relatedId', '', { shouldValidate: false });
                      }}
                      value={field.value}
                      disabled={isPending}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {RELATED_KINDS.map((kind) => (
                          <SelectItem key={kind} value={kind}>
                            {KIND_LABEL[kind]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {relatedKind !== 'none' && (
                <FormField
                  control={form.control}
                  name="relatedId"
                  render={({ field }) => {
                    const value = field.value ? String(field.value) : '';

                    // Only a client can be created on the spot — a lead or
                    // opportunity is a full CRM document, not a one-field
                    // quick-add.
                    if (relatedKind === 'client') {
                      return (
                        <FormItem>
                          <FormLabel>{KIND_LABEL[relatedKind]}</FormLabel>
                          <FormControl>
                            <CreatableSelectField
                              value={value}
                              onChange={field.onChange}
                              options={targets}
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
                      );
                    }

                    return (
                      <FormItem>
                        <FormLabel>{KIND_LABEL[relatedKind]}</FormLabel>
                        <Select onValueChange={field.onChange} value={value} disabled={isPending}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={`Choose a ${relatedKind}`} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {targets.map((target) => (
                              <SelectItem key={target.id} value={target.id}>
                                {target.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              )}
            </div>

            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <textarea
                      className="flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
                {isPending ? 'Saving...' : isEdit ? 'Save' : 'Log activity'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

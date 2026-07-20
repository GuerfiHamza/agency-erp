'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
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

import { quickCreateClientAction } from '../../clients/clients.actions';
import { quickCreateProjectAction } from '../../projects/projects.actions';
import { createEventAction, updateEventAction } from '../calendar.actions';
import type { EventListItem } from '../calendar.service';
import {
  EVENT_LINK_KINDS,
  EVENT_TYPES,
  eventFormSchema,
  type EventFormValues,
  type EventInput,
  type EventLinkKind,
} from '../calendar.validation';

export interface EventLinkOptions {
  clients: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  tasks: { id: string; name: string }[];
}

interface Props {
  /** Omitted or null → create; an event → edit. One form for both. */
  event?: EventListItem | null;
  /** Create only: the day the user clicked, pre-filled as a 1pm–2pm slot. */
  defaultDate?: Date;
  linkOptions: EventLinkOptions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NONE = '__none__';

const LINK_LABELS: Record<EventLinkKind, string> = {
  none: 'Nothing',
  client: 'Client',
  project: 'Project',
  task: 'Task',
};

function humanise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** `datetime-local` speaks local wall-clock with no zone, which is exactly what a calendar means. */
function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultSlot(day: Date | undefined, hour: number): string {
  const base = day ? new Date(day) : new Date();
  base.setHours(hour, 0, 0, 0);

  return toLocalInput(base);
}

export function EventFormDialog({ event, defaultDate, linkOptions, open, onOpenChange }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(event);

  const form = useForm<EventFormValues, unknown, EventInput>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: event?.title ?? '',
      description: event?.description ?? '',
      location: event?.location ?? '',
      type: event?.type ?? 'meeting',
      startsAt: event ? toLocalInput(new Date(event.startsAt)) : defaultSlot(defaultDate, 13),
      endsAt: event ? toLocalInput(new Date(event.endsAt)) : defaultSlot(defaultDate, 14),
      isAllDay: event?.isAllDay ?? false,
      linkKind: event?.linkedKind ?? 'none',
      linkId: event?.clientId ?? event?.projectId ?? event?.taskId ?? '',
    },
  });

  const linkKind = form.watch('linkKind');

  const linkChoices =
    linkKind === 'client'
      ? linkOptions.clients
      : linkKind === 'project'
        ? linkOptions.projects
        : linkKind === 'task'
          ? linkOptions.tasks
          : [];

  function onSubmit(values: EventInput) {
    setFormError(null);

    startTransition(async () => {
      const result = isEdit
        ? await updateEventAction({ eventId: event!.id, ...values })
        : await createEventAction(values);

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      toast.success(isEdit ? 'Event updated.' : 'Event created.');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit event' : 'New event'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this event.' : 'Put something on the calendar.'}
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
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input disabled={isPending} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startsAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Starts</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        disabled={isPending}
                        {...field}
                        value={String(field.value ?? '')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endsAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ends</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        disabled={isPending}
                        {...field}
                        value={String(field.value ?? '')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isAllDay"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={Boolean(field.value)}
                      onCheckedChange={field.onChange}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormLabel className="font-normal">All day</FormLabel>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                        {EVENT_TYPES.map((type) => (
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
                name="linkKind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Link to</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        // The old id belongs to a different table now.
                        form.setValue('linkId', '');
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
                        {EVENT_LINK_KINDS.map((kind) => (
                          <SelectItem key={kind} value={kind}>
                            {LINK_LABELS[kind]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {linkKind !== 'none' && (
                <FormField
                  control={form.control}
                  name="linkId"
                  render={({ field }) => {
                    const value = field.value ? String(field.value) : NONE;
                    const onChange = (next: string) => field.onChange(next === NONE ? '' : next);
                    const options = [{ id: NONE, name: 'None' }, ...linkChoices];

                    // Client and project targets can be created on the spot; a
                    // task cannot yet (no quick-create action exists for it).
                    if (linkKind === 'client' || linkKind === 'project') {
                      return (
                        <FormItem>
                          <FormLabel>{LINK_LABELS[linkKind]}</FormLabel>
                          <FormControl>
                            <CreatableSelectField
                              value={value}
                              onChange={onChange}
                              options={options}
                              placeholder="Choose one"
                              disabled={isPending}
                              createLabel={linkKind === 'client' ? 'New client' : 'New project'}
                              dialogTitle={linkKind === 'client' ? 'New client' : 'New project'}
                              dialogLabel={linkKind === 'client' ? 'Client name' : 'Project name'}
                              onQuickCreate={(name) =>
                                linkKind === 'client'
                                  ? quickCreateClientAction({ name })
                                  : quickCreateProjectAction({ name })
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }

                    return (
                      <FormItem>
                        <FormLabel>{LINK_LABELS[linkKind]}</FormLabel>
                        <Select
                          onValueChange={onChange}
                          value={value}
                          disabled={isPending || linkChoices.length === 0}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Choose one" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {options.map((choice) => (
                              <SelectItem key={choice.id} value={choice.id}>
                                {choice.name}
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
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Meeting room, or a call link"
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
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
                {isPending ? 'Saving...' : isEdit ? 'Save' : 'Create event'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

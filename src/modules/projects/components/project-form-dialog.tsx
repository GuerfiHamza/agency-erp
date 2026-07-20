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

import { createProjectAction, updateProjectAction } from '../projects.actions';
import type { ProjectListItem } from '../projects.service';
import {
  projectFormSchema,
  BILLING_TYPES,
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
  type ProjectFormValues,
  type ProjectInput,
} from '../projects.validation';

interface Props {
  /** Omitted or null → create; a project → edit. One form for both. */
  project?: ProjectListItem | null;
  clientOptions: { id: string; name: string }[];
  managerOptions: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function humanise(value: string): string {
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

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
  control: Control<ProjectFormValues>;
  name: FieldPath<ProjectFormValues>;
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

function EnumSelect({
  control,
  name,
  label,
  options,
  disabled,
}: {
  control: Control<ProjectFormValues>;
  name: FieldPath<ProjectFormValues>;
  label: string;
  options: readonly string[];
  disabled?: boolean;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select onValueChange={field.onChange} value={String(field.value)} disabled={disabled}>
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {humanise(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

const UNASSIGNED = '__none__';

export function ProjectFormDialog({ project, clientOptions, managerOptions, open, onOpenChange }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(project);

  const form = useForm<ProjectFormValues, unknown, ProjectInput>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: project?.name ?? '',
      clientId: project?.clientId ?? '',
      description: project?.description ?? '',
      status: project?.status ?? 'planning',
      priority: project?.priority ?? 'medium',
      billingType: project?.billingType ?? 'fixed_price',
      budget: project?.budget ?? '',
      hourlyRate: project?.hourlyRate ?? '',
      estimatedHours: project?.estimatedHours ?? '',
      currency: project?.currency ?? '',
      startDate: toDateInputValue(project?.startDate ?? null),
      endDate: toDateInputValue(project?.endDate ?? null),
      managerId: project?.managerId ?? '',
    },
  });

  function onSubmit(values: ProjectInput) {
    setFormError(null);

    startTransition(async () => {
      const result = isEdit
        ? await updateProjectAction({ projectId: project!.id, ...values })
        : await createProjectAction(values);

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      toast.success(isEdit ? 'Project updated.' : 'Project created.');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${project!.name}` : 'New project'}</DialogTitle>
          <DialogDescription>
            {isEdit ? `Project ${project!.code}` : 'A code like PRJ-2026-001 is assigned automatically.'}
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
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client</FormLabel>
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
                        <SelectItem value={UNASSIGNED}>Internal (no client)</SelectItem>
                        {clientOptions.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
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
                name="managerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Manager</FormLabel>
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
                        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                        {managerOptions.map((option) => (
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
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <EnumSelect
                control={form.control}
                name="status"
                label="Status"
                options={PROJECT_STATUSES}
                disabled={isPending}
              />
              <EnumSelect
                control={form.control}
                name="priority"
                label="Priority"
                options={PROJECT_PRIORITIES}
                disabled={isPending}
              />
              <EnumSelect
                control={form.control}
                name="billingType"
                label="Billing"
                options={BILLING_TYPES}
                disabled={isPending}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <TextField
                control={form.control}
                name="budget"
                label="Budget"
                placeholder="20000.00"
                disabled={isPending}
              />
              <TextField
                control={form.control}
                name="hourlyRate"
                label="Hourly rate"
                placeholder="120.00"
                disabled={isPending}
              />
              <TextField
                control={form.control}
                name="estimatedHours"
                label="Est. hours"
                placeholder="160"
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

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                control={form.control}
                name="startDate"
                label="Start date"
                type="date"
                disabled={isPending}
              />
              <TextField
                control={form.control}
                name="endDate"
                label="End date"
                type="date"
                disabled={isPending}
              />
            </div>

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
                {isPending ? 'Saving...' : isEdit ? 'Save' : 'Create project'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

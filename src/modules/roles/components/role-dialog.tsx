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

import { createRoleAction, updateRoleAction } from '../roles.actions';
import { createRoleSchema, type CreateRoleFormValues, type CreateRoleInput } from '../roles.validation';

import { PermissionPicker, type PermissionOption } from './permission-picker';

interface Props {
  catalogue: PermissionOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent when creating. Present when editing, or when copying a system role. */
  initial?: {
    roleId?: string;
    name: string;
    description: string | null;
    permissionSlugs: string[];
  };
}

/**
 * Create or edit a custom role.
 *
 * Also the "duplicate" path: a system role's permissions are passed in as
 * `initial` with no `roleId`, which is the supported way to get a variant of
 * Administrator without editing the built-in one.
 */
export function RoleDialog({ catalogue, open, onOpenChange, initial }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const isEditing = Boolean(initial?.roleId);

  const form = useForm<CreateRoleFormValues, unknown, CreateRoleInput>({
    resolver: zodResolver(createRoleSchema),
    defaultValues: {
      name: initial?.name ?? '',
      description: initial?.description ?? '',
      permissionSlugs: initial?.permissionSlugs ?? [],
    },
  });

  function onSubmit(values: CreateRoleInput) {
    setFormError(null);

    startTransition(async () => {
      const result = initial?.roleId
        ? await updateRoleAction({ roleId: initial.roleId, ...values })
        : await createRoleAction(values);

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      toast.success(isEditing ? 'Role updated.' : 'Role created.');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      {/* The permission grid is tall by nature — 24 resources — so the dialog
          scrolls internally rather than pushing the page. */}
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Edit ${initial?.name}` : 'New role'}</DialogTitle>
          <DialogDescription>
            A role is a named set of permissions. People can hold several, and their access is the union of
            all of them.
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role name</FormLabel>
                  <FormControl>
                    <Input placeholder="Finance Lead" disabled={isPending} {...field} />
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
                    <Input
                      placeholder="What this role is for"
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
              name="permissionSlugs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Permissions</FormLabel>
                  <PermissionPicker
                    catalogue={catalogue}
                    selected={field.value}
                    onChange={field.onChange}
                    disabled={isPending}
                  />
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
                {isPending ? 'Saving...' : isEditing ? 'Save role' : 'Create role'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

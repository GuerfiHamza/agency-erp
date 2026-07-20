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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PASSWORD, ROUTES } from '@/config/constants';

import { acceptInvitationAction } from '../users.actions';
import {
  acceptInvitationSchema,
  type AcceptInvitationFormValues,
  type AcceptInvitationInput,
} from '../users.validation';

interface Props {
  token: string;
  /** Shown, not editable — the invitation is bound to this address. */
  email: string;
}

export function AcceptInvitationForm({ token, email }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<AcceptInvitationFormValues, unknown, AcceptInvitationInput>({
    resolver: zodResolver(acceptInvitationSchema),
    defaultValues: { token, name: '', password: '', confirmPassword: '' },
  });

  function onSubmit(values: AcceptInvitationInput) {
    setFormError(null);

    startTransition(async () => {
      const result = await acceptInvitationAction(values);

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      // The action signs them in, so send them where they now belong.
      toast.success('Welcome aboard.');
      router.replace(ROUTES.dashboard);
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {formError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <FormLabel htmlFor="invited-email">Email</FormLabel>
          {/* Disabled and outside the form state: the address comes from the
              invitation, and letting it be edited would let the holder of one
              link create an account for a different address. */}
          <Input id="invited-email" value={email} disabled readOnly />
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your full name</FormLabel>
              <FormControl>
                <Input autoComplete="name" placeholder="Alex Moreau" disabled={isPending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Choose a password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" disabled={isPending} {...field} />
              </FormControl>
              <FormDescription>At least {PASSWORD.minLength} characters.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" disabled={isPending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" aria-hidden />}
          {isPending ? 'Joining...' : 'Join'}
        </Button>
      </form>
    </Form>
  );
}

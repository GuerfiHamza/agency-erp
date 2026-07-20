'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ROUTES } from '@/config/constants';

import { forgotPasswordAction } from '../auth.actions';
import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
  type ForgotPasswordInput,
} from '../auth.validation';

export function ForgotPasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useForm<ForgotPasswordFormValues, unknown, ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  function onSubmit(values: ForgotPasswordInput) {
    startTransition(async () => {
      const result = await forgotPasswordAction(values);

      if (!result.success) {
        // Only reachable on malformed input; the action reports success
        // regardless of whether the address is registered.
        form.setError('email', { message: result.error.message });
        return;
      }

      setSentTo(values.email);
    });
  }

  // Success state. Worded to be true whether or not the address exists — this
  // screen must not become the account-enumeration oracle the action avoids.
  if (sentTo) {
    return (
      <div className="space-y-4">
        <Alert>
          <CheckCircle2 aria-hidden />
          <AlertTitle>Check your inbox</AlertTitle>
          <AlertDescription>
            If an account exists for {sentTo}, a reset link is on its way. It expires in 30 minutes.
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="w-full">
          <Link href={ROUTES.signIn}>Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  disabled={isPending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" aria-hidden />}
          {isPending ? 'Sending...' : 'Send reset link'}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          <Link href={ROUTES.signIn} className="font-medium text-primary underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </Form>
  );
}

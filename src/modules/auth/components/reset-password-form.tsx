'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
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

import { resetPasswordAction } from '../auth.actions';
import {
  resetPasswordSchema,
  type ResetPasswordFormValues,
  type ResetPasswordInput,
} from '../auth.validation';

/** `token` comes from the emailed link and is carried as a hidden field. */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ResetPasswordFormValues, unknown, ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: '', confirmPassword: '' },
  });

  function onSubmit(values: ResetPasswordInput) {
    setFormError(null);

    startTransition(async () => {
      const result = await resetPasswordAction(values);

      if (!result.success) {
        const fieldErrors = result.error.fieldErrors ?? {};

        for (const [field, messages] of Object.entries(fieldErrors)) {
          if (field in values && messages[0]) {
            form.setError(field as keyof ResetPasswordFormValues, { message: messages[0] });
          }
        }

        setFormError(result.error.message);
        return;
      }

      toast.success('Password updated. Sign in with your new password.');
      // Not auto-signed-in: resetting a password is exactly when you want the
      // person to prove they know the new one, and Better Auth revokes the
      // account's other sessions on reset.
      router.replace(ROUTES.signIn);
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

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
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
              <FormLabel>Confirm new password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" disabled={isPending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" aria-hidden />}
          {isPending ? 'Updating...' : 'Update password'}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          <Link
            href={ROUTES.forgotPassword}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Request a new link
          </Link>
        </p>
      </form>
    </Form>
  );
}

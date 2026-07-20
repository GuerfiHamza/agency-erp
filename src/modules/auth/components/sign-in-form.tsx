'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ROUTES } from '@/config/constants';

import { signInAction } from '../auth.actions';
import { signInSchema, type SignInFormValues, type SignInInput } from '../auth.validation';

/**
 * Restrict the post-sign-in destination to a same-origin path.
 *
 * Without this, `?next=https://evil.example` would make the sign-in page an open
 * redirect — a phisher could send a real link to a real site that bounces the
 * user somewhere else the moment they authenticate. Protocol-relative `//host`
 * is rejected for the same reason: the browser treats it as absolute.
 */
function safeRedirect(next: string | null): Route {
  if (!next || !next.startsWith('/') || next.startsWith('//')) {
    return ROUTES.dashboard;
  }

  // typedRoutes cannot check a value that only exists at runtime. The guard
  // above already constrains it to a same-origin path, which is the property
  // that actually matters here.
  return next as Route;
}

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  /** Errors that belong to the form as a whole, not a single field. */
  const [formError, setFormError] = useState<string | null>(null);

  // Three generics because the schema's `.default()` makes the input type
  // (what the fields hold) differ from the output type (what submit receives).
  const form = useForm<SignInFormValues, unknown, SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '', rememberMe: true },
  });

  function onSubmit(values: SignInInput) {
    setFormError(null);

    startTransition(async () => {
      const result = await signInAction(values);

      if (!result.success) {
        // Server-side field errors win over the client's optimistic check.
        const fieldErrors = result.error.fieldErrors ?? {};

        for (const [field, messages] of Object.entries(fieldErrors)) {
          if (field in values && messages[0]) {
            form.setError(field as keyof SignInFormValues, { message: messages[0] });
          }
        }

        setFormError(result.error.message);
        return;
      }

      toast.success('Welcome back.');
      router.replace(safeRedirect(searchParams.get('next')));
      // The session cookie changed, so server components must re-render.
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

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Password</FormLabel>
                <Link
                  href={ROUTES.forgotPassword}
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <FormControl>
                <Input type="password" autoComplete="current-password" disabled={isPending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" aria-hidden />}
          {isPending ? 'Signing in...' : 'Sign in'}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          {'No account? '}
          <Link href={ROUTES.signUp} className="font-medium text-primary underline-offset-4 hover:underline">
            Create one
          </Link>
        </p>
      </form>
    </Form>
  );
}

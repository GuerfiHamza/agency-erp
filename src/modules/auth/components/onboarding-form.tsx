'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ROUTES } from '@/config/constants';

import { onboardAction } from '../auth.actions';
import { onboardingSchema, type OnboardingFormValues, type OnboardingInput } from '../auth.validation';

/**
 * Recovery path for an account that exists but has no company — which happens
 * if company provisioning failed partway through sign-up.
 */
export function OnboardingForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<OnboardingFormValues, unknown, OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { companyName: '' },
  });

  function onSubmit(values: OnboardingInput) {
    setFormError(null);

    startTransition(async () => {
      const result = await onboardAction(values);

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      toast.success('Your workspace is ready.');
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

        <FormField
          control={form.control}
          name="companyName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Company name</FormLabel>
              <FormControl>
                <Input
                  autoComplete="organization"
                  placeholder="Nexus Agency"
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
          {isPending ? 'Setting up...' : 'Finish setup'}
        </Button>
      </form>
    </Form>
  );
}

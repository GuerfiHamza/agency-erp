import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/config/constants';
import { getSession } from '@/lib/auth/session';
import { SignInForm } from '@/modules/auth/components/sign-in-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage() {
  // proxy.ts already bounces signed-in users, but that check is optimistic
  // (cookie presence only). This is the real one, against the database.
  const session = await getSession();

  if (session) {
    redirect(ROUTES.dashboard);
  }

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Enter your credentials to continue.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* SignInForm reads ?next via useSearchParams, which needs a Suspense
            boundary or the whole route opts out of static rendering. */}
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <SignInForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}

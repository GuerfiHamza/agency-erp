import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/config/constants';
import { requireSession } from '@/lib/auth/session';
import { OnboardingForm } from '@/modules/auth/components/onboarding-form';

export const metadata: Metadata = { title: 'Finish setup' };

export default async function OnboardingPage() {
  const session = await requireSession();

  // Already onboarded — nothing to do here.
  if (session.user.companyId) {
    redirect(ROUTES.dashboard);
  }

  return (
    <main className="flex flex-1 items-center justify-center p-gutter">
      <Card className="w-full max-w-md glass">
        <CardHeader>
          <CardTitle>One more step</CardTitle>
          <CardDescription>
            Your account exists but isn&apos;t attached to a company yet. Name it to finish setup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm />
        </CardContent>
      </Card>
    </main>
  );
}

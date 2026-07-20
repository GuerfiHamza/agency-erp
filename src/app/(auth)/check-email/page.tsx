import { MailCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/config/constants';
import { ResendVerificationButton } from '@/modules/auth/components/resend-verification-button';

export const metadata: Metadata = { title: 'Confirm your email' };

/**
 * Shown after sign-up.
 *
 * Reached whether or not the account was newly created — sign-up answers
 * identically either way, and so does this page.
 */
export default async function CheckEmailPage(props: PageProps<'/check-email'>) {
  const params = await props.searchParams;
  const raw = params.email;
  const email = typeof raw === 'string' ? raw : undefined;

  return (
    <Card className="glass">
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MailCheck className="size-5" aria-hidden />
        </div>
        <CardTitle>Confirm your email</CardTitle>
        <CardDescription>
          {email ? (
            <>
              We sent a link to <span className="font-medium text-foreground">{email}</span>. Click it to
              activate your account.
            </>
          ) : (
            'We sent you a link. Click it to activate your account.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          The link is valid for 24 hours. Check your spam folder if it hasn&apos;t arrived.
        </p>

        {email && <ResendVerificationButton email={email} />}

        <Button asChild variant="ghost" className="w-full">
          <Link href={ROUTES.signIn}>Back to sign in</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

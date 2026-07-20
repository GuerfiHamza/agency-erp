import { TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/config/constants';
import { ResetPasswordForm } from '@/modules/auth/components/reset-password-form';

export const metadata: Metadata = { title: 'Choose a new password' };

/**
 * Landing page for the emailed reset link.
 *
 * Better Auth appends `?token=...`, and forwards `?error=...` when the token is
 * already expired or spent. The token is not validated here — only the reset
 * action can do that, and doing it on page load would burn the token on a
 * prefetch.
 */
export default async function ResetPasswordPage(props: PageProps<'/reset-password'>) {
  const params = await props.searchParams;
  const token = typeof params.token === 'string' ? params.token : undefined;
  const error = typeof params.error === 'string' ? params.error : undefined;

  // Error state: arriving with no token, or one Better Auth already rejected.
  if (!token || error) {
    return (
      <Card className="glass">
        <CardHeader>
          <CardTitle>This link doesn&apos;t work</CardTitle>
          <CardDescription>Reset links expire after 30 minutes and can only be used once.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <TriangleAlert aria-hidden />
            <AlertTitle>Link invalid or expired</AlertTitle>
            <AlertDescription>Request a fresh link and use it straight away.</AlertDescription>
          </Alert>
          <Button asChild className="w-full">
            <Link href={ROUTES.forgotPassword}>Request a new link</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>You&apos;ll sign in with this from now on.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm token={token} />
      </CardContent>
    </Card>
  );
}

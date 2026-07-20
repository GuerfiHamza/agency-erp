import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/config/constants';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Sign-ups disabled' };

/**
 * Public sign-up is disabled: this deployment is single-tenant, and
 * `emailAndPassword.disableSignUp` in `lib/auth/auth.ts` blocks the API route
 * itself, not just this page. The only way in is an admin invitation — see
 * `src/modules/users`.
 */
export default async function SignUpPage() {
  const session = await getSession();

  if (session) {
    redirect(ROUTES.dashboard);
  }

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle>Sign-ups are disabled</CardTitle>
        <CardDescription>
          This workspace is invite-only. Ask an administrator to send you an invitation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <Link href={ROUTES.signIn}>Back to sign in</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

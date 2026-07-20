import type { Metadata } from 'next';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/states';
import { ROUTES } from '@/config/constants';
import { AcceptInvitationForm } from '@/modules/users/components/accept-invitation-form';
import { previewInvitation } from '@/modules/users/users.service';

export const metadata: Metadata = { title: 'Accept invitation' };

/**
 * Where an emailed invitation link lands. **Public** — the whole point is that
 * the visitor has no account yet, so there is no session to require.
 *
 * Deliberately not in the proxy's `AUTH_ROUTES`, for the same reason as
 * `/reset-password`: a signed-in person clicking an invitation must reach this
 * page and be told plainly what is wrong, not be bounced to a dashboard.
 *
 * The token is validated here so an expired or spent link shows a real message
 * instead of a form that can only fail on submit.
 */
export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return <InvalidInvitation description="This link is missing its invitation code." />;
  }

  // The catch wraps the lookup only, never the JSX. A rendering error thrown
  // inside a try/catch would not be caught by it anyway — React renders later —
  // so catching around JSX only pretends to handle it. That is what
  // `react-hooks/error-boundaries` objects to, and it is right: rendering
  // failures belong to error.tsx.
  //
  // previewInvitation gives one message for missing, expired, and already-used
  // — the differences help nobody but someone guessing tokens.
  const invitation = await previewInvitation(token).catch(() => null);

  if (!invitation) {
    return <InvalidInvitation description="This invitation is no longer valid. Ask for a new one." />;
  }

  return (
    <main className="flex flex-1 items-center justify-center p-gutter">
      <Card className="w-full max-w-md glass">
        <CardHeader>
          <CardTitle>Join {invitation.companyName}</CardTitle>
          <CardDescription>
            You&apos;ve been invited as {invitation.roleName}. Choose a password to finish setting up your
            account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AcceptInvitationForm token={token} email={invitation.email} />
        </CardContent>
      </Card>
    </main>
  );
}

function InvalidInvitation({ description }: { description: string }) {
  return (
    <main className="flex flex-1 items-center justify-center p-gutter">
      <ErrorState
        title="Invitation not valid"
        description={description}
        action={
          <Link href={ROUTES.signIn} className={buttonVariants({ variant: 'outline' })}>
            Go to sign in
          </Link>
        }
      />
    </main>
  );
}

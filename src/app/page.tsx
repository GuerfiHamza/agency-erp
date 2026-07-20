import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { APP_DESCRIPTION, APP_NAME, ROUTES } from '@/config/constants';
import { getSession } from '@/lib/auth/session';

/**
 * Landing page. Replaced by a marketing page later; for now it routes people to
 * the right place based on whether they are signed in.
 */
export default async function Home() {
  const session = await getSession();

  if (session) {
    redirect(session.user.companyId ? ROUTES.dashboard : ROUTES.onboarding);
  }

  return (
    <main className="flex flex-1 items-center justify-center p-gutter">
      <section className="w-full max-w-md rounded-lg p-8 text-center glass">
        <h1 className="font-sans text-3xl font-semibold tracking-tight text-foreground">{APP_NAME}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{APP_DESCRIPTION}</p>

        <div className="mt-6 flex justify-center gap-3">
          <Button asChild>
            <Link href={ROUTES.signUp}>Get started</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={ROUTES.signIn}>Sign in</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}

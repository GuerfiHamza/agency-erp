'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ROUTES } from '@/config/constants';

import { signOutAction } from '../auth.actions';

export function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onSignOut() {
    startTransition(async () => {
      const result = await signOutAction();

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      router.replace(ROUTES.signIn);
      // Without refresh, cached server components would still render the
      // signed-in shell after the cookie is gone.
      router.refresh();
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={onSignOut} disabled={isPending}>
      <LogOut aria-hidden />
      {isPending ? 'Signing out...' : 'Sign out'}
    </Button>
  );
}

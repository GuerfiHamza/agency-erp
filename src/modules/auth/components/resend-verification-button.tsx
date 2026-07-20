'use client';

import { Loader2, Send } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { resendVerificationAction } from '../auth.actions';

/**
 * Resend the verification email.
 *
 * Reports the same message whichever way the request goes — the action does not
 * reveal whether the address is registered, and this button must not either.
 */
export function ResendVerificationButton({ email }: { email: string }) {
  const [isPending, startTransition] = useTransition();

  function onResend() {
    startTransition(async () => {
      await resendVerificationAction({ email });
      toast.success('If that address needs confirming, a new link is on its way.');
    });
  }

  return (
    <Button variant="outline" className="w-full" onClick={onResend} disabled={isPending}>
      {isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
      {isPending ? 'Sending...' : 'Resend the link'}
    </Button>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ROUTES } from '@/config/constants';

import { deleteCompanyAction } from '../companies.actions';

interface Props {
  companyName: string;
}

/**
 * Closing the company. Rendered only for holders of `companies:delete`, which
 * in practice is the owner alone.
 *
 * The dialog spells out the real consequence rather than asking "are you sure?":
 * this signs out every member, the caller included, and there is no route back
 * in through the product.
 */
export function DeleteCompanyCard({ companyName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">Close this company</CardTitle>
        <CardDescription>
          Deactivates {companyName} and signs out everyone in it, permanently. Records are retained for
          accounting, but nobody will be able to sign in. This cannot be undone from here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Close company
        </Button>

        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          destructive
          title={`Close ${companyName}?`}
          description={`Every member of ${companyName}, including you, will be signed out and unable to sign back in. This cannot be undone from within the app.`}
          confirmLabel="Close company"
          onConfirm={async () => {
            const result = await deleteCompanyAction();

            // On success the caller is already deactivated, so any further
            // navigation would only bounce off the proxy. Go where they now
            // belong instead of leaving a dead settings page on screen.
            if (result.success) router.replace(ROUTES.signIn);

            return result;
          }}
        />
      </CardContent>
    </Card>
  );
}

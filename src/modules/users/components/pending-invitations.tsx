'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

import { revokeInvitationAction } from '../users.actions';
import type { PendingInvitation } from '../users.service';

interface Props {
  invitations: PendingInvitation[];
  canRevoke: boolean;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/**
 * Invitations that have been sent but not accepted.
 *
 * Kept separate from the users table rather than mixed in as "pending" rows:
 * these are not accounts. Nobody can sign in as them, they have no roles yet,
 * and the only action they support is revocation. Listing them alongside real
 * users would mean every row action needed a "but not for pending" branch.
 */
export function PendingInvitations({ invitations, canRevoke }: Props) {
  const [revoking, setRevoking] = useState<PendingInvitation | null>(null);

  if (invitations.length === 0) return null;

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle>Pending invitations</CardTitle>
        <CardDescription>
          {invitations.length === 1 ? '1 person has' : `${invitations.length} people have`} been invited but
          haven&apos;t joined yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {invitations.map((invitation) => (
          <div
            key={invitation.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{invitation.email}</p>
              <p className="text-xs text-muted-foreground">
                {invitation.roleName}
                {invitation.invitedByName ? ` · invited by ${invitation.invitedByName}` : ''} · expires{' '}
                {dateFormatter.format(invitation.expiresAt)}
              </p>
            </div>

            {canRevoke && (
              <Button variant="ghost" size="sm" onClick={() => setRevoking(invitation)}>
                Revoke
              </Button>
            )}
          </div>
        ))}
      </CardContent>

      {revoking && (
        <ConfirmDialog
          open
          onOpenChange={() => setRevoking(null)}
          destructive
          title={`Revoke the invitation to ${revoking.email}?`}
          description="Their link stops working immediately. You can invite them again afterwards."
          confirmLabel="Revoke"
          successMessage="Invitation revoked."
          onConfirm={() => revokeInvitationAction({ invitationId: revoking.id })}
        />
      )}
    </Card>
  );
}

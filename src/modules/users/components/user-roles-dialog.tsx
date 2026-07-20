'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

import { setUserRolesAction } from '../users.actions';
import type { UserListItem } from '../users.service';

interface Props {
  user: UserListItem;
  roleOptions: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Assign roles.
 *
 * Checkboxes rather than a single select because a user's permissions are the
 * union of several roles — the data model allows many, so the control must too.
 */
export function UserRolesDialog({ user, roleOptions, open, onOpenChange }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(() => user.roles.map((role) => role.id));

  function toggle(roleId: string, checked: boolean): void {
    setSelected((current) => (checked ? [...current, roleId] : current.filter((id) => id !== roleId)));
  }

  function save(): void {
    setError(null);

    startTransition(async () => {
      const result = await setUserRolesAction({ userId: user.id, roleIds: selected });

      if (!result.success) {
        // Kept in the dialog: the likely failure is "this is the last owner",
        // which the user can fix right here by choosing differently.
        setError(result.error.message);
        return;
      }

      toast.success('Roles updated.');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Roles for {user.name}</DialogTitle>
          <DialogDescription>
            Permissions are the union of every role selected. Someone with no role can sign in but do nothing.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          {roleOptions.map((role) => (
            <div key={role.id} className="flex items-center gap-3">
              <Checkbox
                id={`role-${role.id}`}
                checked={selected.includes(role.id)}
                onCheckedChange={(checked) => toggle(role.id, checked === true)}
                disabled={isPending}
              />
              <Label htmlFor={`role-${role.id}`} className="font-normal">
                {role.name}
              </Label>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isPending}>
            {isPending && <Loader2 className="animate-spin" aria-hidden />}
            {isPending ? 'Saving...' : 'Save roles'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

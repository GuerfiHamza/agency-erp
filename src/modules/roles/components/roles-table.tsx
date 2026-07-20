'use client';

import { MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';

import { deleteRoleAction } from '../roles.actions';

import type { PermissionOption } from './permission-picker';
import { RoleDialog } from './role-dialog';

/** A role with enough detail to display, edit, and duplicate without a round-trip. */
export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissionCount: number;
  permissionSlugs: string[];
}

interface Props {
  roles: RoleRow[];
  catalogue: PermissionOption[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

type DialogState =
  | { kind: 'none' }
  // No `roleId` → create. Present → edit. Duplicate reuses create with a
  // pre-filled name and permissions.
  | { kind: 'form'; initial?: RoleDialogInitial }
  | { kind: 'delete'; role: RoleRow };

type RoleDialogInitial = {
  roleId?: string;
  name: string;
  description: string | null;
  permissionSlugs: string[];
};

export function RolesTable({ roles, catalogue, canCreate, canUpdate, canDelete }: Props) {
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const close = () => setDialog({ kind: 'none' });

  function duplicateInitial(role: RoleRow): RoleDialogInitial {
    return {
      name: `Copy of ${role.name}`,
      description: role.description,
      permissionSlugs: role.permissionSlugs,
    };
  }

  return (
    <>
      {canCreate && (
        <div className="flex justify-end">
          <Button onClick={() => setDialog({ kind: 'form' })}>
            <Plus aria-hidden />
            New role
          </Button>
        </div>
      )}

      {roles.length === 0 ? (
        <EmptyState
          title="No roles"
          description="Every workspace starts with built-in roles. Create a custom one to fit how your team works."
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead className="text-right">Permissions</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => {
                // A system role can be duplicated but never edited or deleted;
                // a custom role can do all three. Withhold controls that could
                // only fail — the service refuses them anyway.
                const canEdit = canUpdate && !role.isSystem;
                const canRemove = canDelete && !role.isSystem;
                const hasActions = canCreate || canEdit || canRemove;

                return (
                  <TableRow key={role.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{role.name}</span>
                        {role.isSystem && <Badge variant="secondary">Built-in</Badge>}
                      </div>
                      {role.description && (
                        <p className="text-xs text-muted-foreground">{role.description}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {role.userCount}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {role.permissionCount}
                    </TableCell>
                    <TableCell>
                      {hasActions && (
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8">
                                <MoreHorizontal aria-hidden />
                                <span className="sr-only">Actions for {role.name}</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {canEdit && (
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setDialog({
                                      kind: 'form',
                                      initial: {
                                        roleId: role.id,
                                        name: role.name,
                                        description: role.description,
                                        permissionSlugs: role.permissionSlugs,
                                      },
                                    })
                                  }
                                >
                                  Edit
                                </DropdownMenuItem>
                              )}
                              {canCreate && (
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setDialog({ kind: 'form', initial: duplicateInitial(role) })
                                  }
                                >
                                  Duplicate
                                </DropdownMenuItem>
                              )}
                              {canRemove && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() => setDialog({ kind: 'delete', role })}
                                  >
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {dialog.kind === 'form' && (
        <RoleDialog catalogue={catalogue} open onOpenChange={close} initial={dialog.initial} />
      )}

      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={`Delete ${dialog.role.name}?`}
          description="This role and its permission grants are removed. People holding it must be reassigned first."
          confirmLabel="Delete"
          successMessage="Role deleted."
          onConfirm={() => deleteRoleAction({ roleId: dialog.role.id })}
        />
      )}
    </>
  );
}

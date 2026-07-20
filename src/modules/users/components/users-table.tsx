'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';

import { DataTable, DataTableColumnHeader, useTableParams } from '@/components/data-table/data-table';
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
import { EmptyState } from '@/components/ui/states';

import { deleteUserAction, setUserActiveAction } from '../users.actions';
import type { UserListItem } from '../users.service';

import { EditUserDialog } from './edit-user-dialog';
import { UserRolesDialog } from './user-roles-dialog';

interface RoleOption {
  id: string;
  name: string;
}

interface Props {
  users: UserListItem[];
  totalItems: number;
  roleOptions: RoleOption[];
  /** The signed-in user — the row that must not offer self-destructive actions. */
  currentUserId: string;
  canUpdate: boolean;
  canDelete: boolean;
  canAssignRoles: boolean;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'edit'; user: UserListItem }
  | { kind: 'roles'; user: UserListItem }
  | { kind: 'deactivate'; user: UserListItem }
  | { kind: 'delete'; user: UserListItem };

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function UsersTable({
  users,
  totalItems,
  roleOptions,
  currentUserId,
  canUpdate,
  canDelete,
  canAssignRoles,
}: Props) {
  const { hasActiveFilters } = useTableParams();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });

  const close = () => setDialog({ kind: 'none' });

  const columns = useMemo<ColumnDef<UserListItem, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <DataTableColumnHeader columnId="name" title="Name" />,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
          </div>
        ),
      },
      {
        accessorKey: 'jobTitle',
        header: () => <DataTableColumnHeader columnId="jobTitle" title="Job title" />,
        cell: ({ row }) => row.original.jobTitle ?? <span className="text-muted-foreground">—</span>,
      },
      {
        id: 'roles',
        header: 'Roles',
        cell: ({ row }) =>
          row.original.roles.length === 0 ? (
            // Not cosmetic: a user with no role can sign in and do nothing, which
            // looks like a broken app unless it is stated.
            <span className="text-xs text-muted-foreground">No role</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.original.roles.map((role) => (
                <Badge key={role.id} variant="secondary">
                  {role.name}
                </Badge>
              ))}
            </div>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) =>
          row.original.isActive ? (
            <Badge variant="outline">Active</Badge>
          ) : (
            <Badge variant="destructive">Deactivated</Badge>
          ),
      },
      {
        accessorKey: 'lastLoginAt',
        header: () => <DataTableColumnHeader columnId="lastLoginAt" title="Last sign-in" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.lastLoginAt ? dateFormatter.format(row.original.lastLoginAt) : 'Never'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const target = row.original;
          const isSelf = target.id === currentUserId;

          if (!canUpdate && !canDelete && !canAssignRoles) return null;

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal aria-hidden />
                    <span className="sr-only">Actions for {target.name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canUpdate && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit', user: target })}>
                      Edit profile
                    </DropdownMenuItem>
                  )}
                  {canAssignRoles && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'roles', user: target })}>
                      Change roles
                    </DropdownMenuItem>
                  )}

                  {/* Self-destructive actions are withheld from your own row.
                      The service refuses them anyway; offering a control that
                      can only fail is worse than not offering it. */}
                  {canUpdate && !isSelf && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() =>
                          target.isActive
                            ? setDialog({ kind: 'deactivate', user: target })
                            : void setUserActiveAction({ userId: target.id, isActive: true })
                        }
                      >
                        {target.isActive ? 'Deactivate' : 'Reactivate'}
                      </DropdownMenuItem>
                    </>
                  )}

                  {canDelete && !isSelf && (
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setDialog({ kind: 'delete', user: target })}
                    >
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [canAssignRoles, canDelete, canUpdate, currentUserId],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={users}
        totalItems={totalItems}
        getRowId={(row) => row.id}
        searchPlaceholder="Search name, email, or job title..."
        statusOptions={[
          { label: 'Active', value: 'active' },
          { label: 'Deactivated', value: 'inactive' },
        ]}
        hasActiveFilters={hasActiveFilters}
        emptyState={
          <EmptyState
            title="No people yet"
            description="Invite a colleague to give them access to this workspace."
          />
        }
      />

      {dialog.kind === 'edit' && <EditUserDialog user={dialog.user} open onOpenChange={close} />}

      {dialog.kind === 'roles' && (
        <UserRolesDialog user={dialog.user} roleOptions={roleOptions} open onOpenChange={close} />
      )}

      {/* Rendered only while a user is chosen, so neither dialog needs a
          "nothing selected" branch that could never legitimately run. */}
      {dialog.kind === 'deactivate' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={`Deactivate ${dialog.user.name}?`}
          description="They will be signed out immediately and cannot sign back in until reactivated. Their work stays intact."
          confirmLabel="Deactivate"
          successMessage="Account deactivated."
          onConfirm={() => setUserActiveAction({ userId: dialog.user.id, isActive: false })}
        />
      )}

      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={`Delete ${dialog.user.name}?`}
          description="Their account is removed and they are signed out. Work they created — projects, invoices, time entries — is kept and stays attributed to them."
          confirmLabel="Delete"
          successMessage="Account deleted."
          onConfirm={() => deleteUserAction({ userId: dialog.user.id })}
        />
      )}
    </>
  );
}

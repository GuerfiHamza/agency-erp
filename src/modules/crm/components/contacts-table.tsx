'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Plus } from 'lucide-react';
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

import { deleteContactAction } from '../contacts.actions';
import type { ContactListItem } from '../contacts.service';

import { ContactFormDialog } from './contact-form-dialog';

interface Props {
  contacts: ContactListItem[];
  totalItems: number;
  clientOptions: { id: string; name: string }[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; contact: ContactListItem }
  | { kind: 'delete'; contact: ContactListItem };

function fullName(contact: ContactListItem): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ');
}

export function ContactsTable({
  contacts,
  totalItems,
  clientOptions,
  canCreate,
  canUpdate,
  canDelete,
}: Props) {
  const { hasActiveFilters } = useTableParams();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });

  const close = () => setDialog({ kind: 'none' });

  const columns = useMemo<ColumnDef<ContactListItem, unknown>[]>(
    () => [
      {
        accessorKey: 'firstName',
        header: () => <DataTableColumnHeader columnId="firstName" title="Name" />,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{fullName(row.original)}</p>
              {row.original.jobTitle && (
                <p className="truncate text-xs text-muted-foreground">{row.original.jobTitle}</p>
              )}
            </div>
            {row.original.isPrimary && <Badge variant="outline">Primary</Badge>}
          </div>
        ),
      },
      {
        id: 'client',
        header: 'Client',
        cell: ({ row }) => <span className="text-sm">{row.original.clientName}</span>,
      },
      {
        id: 'email',
        header: 'Email',
        cell: ({ row }) => row.original.email ?? <span className="text-muted-foreground">—</span>,
      },
      {
        id: 'phone',
        header: 'Phone',
        cell: ({ row }) =>
          row.original.phone ?? row.original.mobile ?? <span className="text-muted-foreground">—</span>,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const contact = row.original;

          if (!canUpdate && !canDelete) return null;

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal aria-hidden />
                    <span className="sr-only">Actions for {fullName(contact)}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canUpdate && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit', contact })}>
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDialog({ kind: 'delete', contact })}
                      >
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [canDelete, canUpdate],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={contacts}
        totalItems={totalItems}
        getRowId={(row) => row.id}
        searchPlaceholder="Search name or email..."
        hasActiveFilters={hasActiveFilters}
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
              <Plus aria-hidden />
              New contact
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            title="No contacts yet"
            description="Add a person at one of your clients to start building relationships."
            action={
              canCreate ? (
                <Button onClick={() => setDialog({ kind: 'create' })}>
                  <Plus aria-hidden />
                  New contact
                </Button>
              ) : undefined
            }
          />
        }
      />

      {dialog.kind === 'create' && (
        <ContactFormDialog clientOptions={clientOptions} open onOpenChange={close} />
      )}

      {dialog.kind === 'edit' && (
        <ContactFormDialog contact={dialog.contact} clientOptions={clientOptions} open onOpenChange={close} />
      )}

      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={`Delete ${fullName(dialog.contact)}?`}
          description="The contact is removed from the client. Documents already addressed to them are unaffected."
          confirmLabel="Delete"
          successMessage="Contact deleted."
          onConfirm={() => deleteContactAction({ contactId: dialog.contact.id })}
        />
      )}
    </>
  );
}

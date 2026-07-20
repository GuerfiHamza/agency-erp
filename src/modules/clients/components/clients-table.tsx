'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Download, MoreHorizontal, Plus } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

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

import { deleteClientAction, exportClientsAction } from '../clients.actions';
import type { ClientListItem } from '../clients.service';
import { CLIENT_STATUSES } from '../clients.validation';

import { ClientFormDialog } from './client-form-dialog';

interface Props {
  clients: ClientListItem[];
  totalItems: number;
  ownerOptions: { id: string; name: string }[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canExport: boolean;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; client: ClientListItem }
  | { kind: 'delete'; client: ClientListItem };

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

const STATUS_VARIANT: Record<(typeof CLIENT_STATUSES)[number], 'default' | 'secondary' | 'outline'> = {
  prospect: 'secondary',
  active: 'default',
  inactive: 'outline',
  archived: 'outline',
};

export function ClientsTable({
  clients,
  totalItems,
  ownerOptions,
  canCreate,
  canUpdate,
  canDelete,
  canExport,
}: Props) {
  const { params, hasActiveFilters } = useTableParams();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [isExporting, startExport] = useTransition();

  const close = () => setDialog({ kind: 'none' });

  function onExport() {
    startExport(async () => {
      const result = await exportClientsAction({
        q: params.q,
        sort: params.sort,
        order: params.order,
        status: params.status,
      });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      // Turn the CSV text into a file the browser downloads. A Blob + object URL
      // is the whole mechanism; no library and no server file to clean up.
      const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.data.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  }

  const columns = useMemo<ColumnDef<ClientListItem, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <DataTableColumnHeader columnId="name" title="Name" />,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            {row.original.email && (
              <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
            )}
          </div>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        cell: ({ row }) => <span className="capitalize">{row.original.type}</span>,
      },
      {
        accessorKey: 'status',
        header: () => <DataTableColumnHeader columnId="status" title="Status" />,
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]} className="capitalize">
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: 'owner',
        header: 'Account manager',
        cell: ({ row }) =>
          row.original.ownerName ?? <span className="text-muted-foreground">Unassigned</span>,
      },
      {
        accessorKey: 'createdAt',
        header: () => <DataTableColumnHeader columnId="createdAt" title="Added" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {dateFormatter.format(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const client = row.original;

          if (!canUpdate && !canDelete) return null;

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal aria-hidden />
                    <span className="sr-only">Actions for {client.name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canUpdate && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit', client })}>
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDialog({ kind: 'delete', client })}
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
        data={clients}
        totalItems={totalItems}
        getRowId={(row) => row.id}
        searchPlaceholder="Search name, email, or legal name..."
        statusOptions={CLIENT_STATUSES.map((status) => ({
          label: status.charAt(0).toUpperCase() + status.slice(1),
          value: status,
        }))}
        hasActiveFilters={hasActiveFilters}
        actions={
          <>
            {canExport && (
              <Button variant="outline" size="sm" onClick={onExport} disabled={isExporting}>
                <Download aria-hidden />
                Export
              </Button>
            )}
            {canCreate && (
              <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
                <Plus aria-hidden />
                New client
              </Button>
            )}
          </>
        }
        emptyState={
          <EmptyState
            title="No clients yet"
            description="Add your first client to start quoting and invoicing."
            action={
              canCreate ? (
                <Button onClick={() => setDialog({ kind: 'create' })}>
                  <Plus aria-hidden />
                  New client
                </Button>
              ) : undefined
            }
          />
        }
      />

      {dialog.kind === 'create' && <ClientFormDialog ownerOptions={ownerOptions} open onOpenChange={close} />}

      {dialog.kind === 'edit' && (
        <ClientFormDialog client={dialog.client} ownerOptions={ownerOptions} open onOpenChange={close} />
      )}

      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={`Delete ${dialog.client.name}?`}
          description="The client is removed from your lists. Documents already issued to them — quotes, invoices, payments — are kept."
          confirmLabel="Delete"
          successMessage="Client deleted."
          onConfirm={() => deleteClientAction({ clientId: dialog.client.id })}
        />
      )}
    </>
  );
}

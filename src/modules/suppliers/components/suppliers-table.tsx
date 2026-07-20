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

import { deleteSupplierAction } from '../suppliers.actions';
import type { SupplierRow } from '../suppliers.service';
import { SUPPLIER_STATUSES } from '../suppliers.validation';

import { SupplierFormDialog } from './supplier-form-dialog';

interface Props {
  suppliers: SupplierRow[];
  totalItems: number;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; supplier: SupplierRow }
  | { kind: 'delete'; supplier: SupplierRow };

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

const STATUS_VARIANT: Record<(typeof SUPPLIER_STATUSES)[number], 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  inactive: 'secondary',
  archived: 'outline',
};

export function SuppliersTable({ suppliers, totalItems, canCreate, canUpdate, canDelete }: Props) {
  const { hasActiveFilters } = useTableParams();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });

  const close = () => setDialog({ kind: 'none' });

  const columns = useMemo<ColumnDef<SupplierRow, unknown>[]>(
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
        accessorKey: 'status',
        header: () => <DataTableColumnHeader columnId="status" title="Status" />,
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]} className="capitalize">
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: 'contact',
        header: 'Contact',
        cell: ({ row }) => row.original.contactName ?? <span className="text-muted-foreground">—</span>,
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
          const supplier = row.original;

          if (!canUpdate && !canDelete) return null;

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal aria-hidden />
                    <span className="sr-only">Actions for {supplier.name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canUpdate && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit', supplier })}>
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDialog({ kind: 'delete', supplier })}
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
        data={suppliers}
        totalItems={totalItems}
        getRowId={(row) => row.id}
        searchPlaceholder="Search name, email, or legal name..."
        statusOptions={SUPPLIER_STATUSES.map((status) => ({
          label: status.charAt(0).toUpperCase() + status.slice(1),
          value: status,
        }))}
        hasActiveFilters={hasActiveFilters}
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
              <Plus aria-hidden />
              New supplier
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            title="No suppliers yet"
            description="Add a supplier to start ordering stock or services."
            action={
              canCreate ? (
                <Button onClick={() => setDialog({ kind: 'create' })}>
                  <Plus aria-hidden />
                  New supplier
                </Button>
              ) : undefined
            }
          />
        }
      />

      {dialog.kind === 'create' && <SupplierFormDialog open onOpenChange={close} />}

      {dialog.kind === 'edit' && <SupplierFormDialog supplier={dialog.supplier} open onOpenChange={close} />}

      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={`Delete ${dialog.supplier.name}?`}
          description="The supplier is removed from your lists. Purchase orders already issued to them are kept."
          confirmLabel="Delete"
          successMessage="Supplier deleted."
          onConfirm={() => deleteSupplierAction({ supplierId: dialog.supplier.id })}
        />
      )}
    </>
  );
}

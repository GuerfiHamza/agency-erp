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

import { convertLeadAction, deleteLeadAction } from '../leads.actions';
import type { LeadListItem } from '../leads.service';
import { LEAD_STATUSES } from '../leads.validation';

import { LeadFormDialog } from './lead-form-dialog';

interface Props {
  leads: LeadListItem[];
  totalItems: number;
  ownerOptions: { id: string; name: string }[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** Conversion creates a client, so it needs `clients:create` too. */
  canConvert: boolean;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; lead: LeadListItem }
  | { kind: 'convert'; lead: LeadListItem }
  | { kind: 'delete'; lead: LeadListItem };

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function humanise(value: string): string {
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const STATUS_VARIANT: Record<
  (typeof LEAD_STATUSES)[number],
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  new: 'secondary',
  contacted: 'secondary',
  qualified: 'default',
  unqualified: 'destructive',
  converted: 'outline',
};

export function LeadsTable({
  leads,
  totalItems,
  ownerOptions,
  canCreate,
  canUpdate,
  canDelete,
  canConvert,
}: Props) {
  const { hasActiveFilters } = useTableParams();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });

  const close = () => setDialog({ kind: 'none' });

  const columns = useMemo<ColumnDef<LeadListItem, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <DataTableColumnHeader columnId="name" title="Name" />,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            {row.original.companyName && (
              <p className="truncate text-xs text-muted-foreground">{row.original.companyName}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: () => <DataTableColumnHeader columnId="status" title="Status" />,
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]}>{humanise(row.original.status)}</Badge>
        ),
      },
      {
        id: 'source',
        header: 'Source',
        cell: ({ row }) => <span className="text-sm">{humanise(row.original.source)}</span>,
      },
      {
        id: 'value',
        header: 'Est. value',
        cell: ({ row }) =>
          row.original.estimatedValue ? (
            <span className="font-mono text-sm">
              {row.original.estimatedValue}
              {row.original.currency ? ` ${row.original.currency}` : ''}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'owner',
        header: 'Owner',
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
          const lead = row.original;
          const isConverted = lead.convertedAt !== null;
          const showConvert = canConvert && !isConverted;

          if (!canUpdate && !canDelete && !showConvert) return null;

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal aria-hidden />
                    <span className="sr-only">Actions for {lead.name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canUpdate && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit', lead })}>
                      Edit
                    </DropdownMenuItem>
                  )}
                  {showConvert && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'convert', lead })}>
                      Convert to client
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDialog({ kind: 'delete', lead })}
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
    [canConvert, canDelete, canUpdate],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={leads}
        totalItems={totalItems}
        getRowId={(row) => row.id}
        searchPlaceholder="Search name, email, or company..."
        statusOptions={LEAD_STATUSES.map((status) => ({ label: humanise(status), value: status }))}
        hasActiveFilters={hasActiveFilters}
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
              <Plus aria-hidden />
              New lead
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            title="No leads yet"
            description="Log an enquiry to start tracking your pipeline."
            action={
              canCreate ? (
                <Button onClick={() => setDialog({ kind: 'create' })}>
                  <Plus aria-hidden />
                  New lead
                </Button>
              ) : undefined
            }
          />
        }
      />

      {dialog.kind === 'create' && <LeadFormDialog ownerOptions={ownerOptions} open onOpenChange={close} />}

      {dialog.kind === 'edit' && (
        <LeadFormDialog lead={dialog.lead} ownerOptions={ownerOptions} open onOpenChange={close} />
      )}

      {dialog.kind === 'convert' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          title={`Convert ${dialog.lead.name} to a client?`}
          description="A new client is created from this lead's details. The lead is kept and marked converted so it still counts in your funnel."
          confirmLabel="Convert"
          successMessage="Lead converted to a client."
          onConfirm={() => convertLeadAction({ leadId: dialog.lead.id })}
        />
      )}

      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={`Delete ${dialog.lead.name}?`}
          description="The lead is removed from your pipeline. Any client already created from it is kept."
          confirmLabel="Delete"
          successMessage="Lead deleted."
          onConfirm={() => deleteLeadAction({ leadId: dialog.lead.id })}
        />
      )}
    </>
  );
}

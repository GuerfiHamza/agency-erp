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

import { deleteOpportunityAction } from '../opportunities.actions';
import type { OpportunityListItem } from '../opportunities.service';
import { OPPORTUNITY_STAGES } from '../opportunities.validation';

import { OpportunityFormDialog } from './opportunity-form-dialog';

interface Props {
  opportunities: OpportunityListItem[];
  totalItems: number;
  clientOptions: { id: string; name: string }[];
  ownerOptions: { id: string; name: string }[];
  contactsByClient: Record<string, { id: string; name: string }[]>;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; opportunity: OpportunityListItem }
  | { kind: 'delete'; opportunity: OpportunityListItem };

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function humanise(value: string): string {
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const STAGE_VARIANT: Record<
  (typeof OPPORTUNITY_STAGES)[number],
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  discovery: 'secondary',
  qualification: 'secondary',
  proposal: 'default',
  negotiation: 'default',
  won: 'outline',
  lost: 'destructive',
};

export function OpportunitiesTable({
  opportunities,
  totalItems,
  clientOptions,
  ownerOptions,
  contactsByClient,
  canCreate,
  canUpdate,
  canDelete,
}: Props) {
  const { hasActiveFilters } = useTableParams();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });

  const close = () => setDialog({ kind: 'none' });

  const columns = useMemo<ColumnDef<OpportunityListItem, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <DataTableColumnHeader columnId="name" title="Name" />,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.clientName}</p>
          </div>
        ),
      },
      {
        accessorKey: 'stage',
        header: () => <DataTableColumnHeader columnId="stage" title="Stage" />,
        cell: ({ row }) => (
          <Badge variant={STAGE_VARIANT[row.original.stage]}>{humanise(row.original.stage)}</Badge>
        ),
      },
      {
        id: 'value',
        header: 'Value',
        cell: ({ row }) =>
          row.original.value ? (
            <span className="font-mono text-sm">
              {row.original.value}
              {row.original.currency ? ` ${row.original.currency}` : ''}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'probability',
        header: 'Prob.',
        cell: ({ row }) =>
          row.original.probability ? (
            <span className="font-mono text-sm">{row.original.probability}%</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'expectedClose',
        header: 'Expected close',
        cell: ({ row }) =>
          row.original.expectedCloseDate ? (
            <span className="text-xs text-muted-foreground">
              {dateFormatter.format(row.original.expectedCloseDate)}
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
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const opportunity = row.original;

          if (!canUpdate && !canDelete) return null;

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal aria-hidden />
                    <span className="sr-only">Actions for {opportunity.name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canUpdate && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit', opportunity })}>
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDialog({ kind: 'delete', opportunity })}
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
        data={opportunities}
        totalItems={totalItems}
        getRowId={(row) => row.id}
        searchPlaceholder="Search opportunities..."
        statusOptions={OPPORTUNITY_STAGES.map((stage) => ({ label: humanise(stage), value: stage }))}
        hasActiveFilters={hasActiveFilters}
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
              <Plus aria-hidden />
              New opportunity
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            title="No opportunities yet"
            description="Track a qualified deal to start building your pipeline."
            action={
              canCreate ? (
                <Button onClick={() => setDialog({ kind: 'create' })}>
                  <Plus aria-hidden />
                  New opportunity
                </Button>
              ) : undefined
            }
          />
        }
      />

      {dialog.kind === 'create' && (
        <OpportunityFormDialog
          clientOptions={clientOptions}
          ownerOptions={ownerOptions}
          contactsByClient={contactsByClient}
          open
          onOpenChange={close}
        />
      )}

      {dialog.kind === 'edit' && (
        <OpportunityFormDialog
          opportunity={dialog.opportunity}
          clientOptions={clientOptions}
          ownerOptions={ownerOptions}
          contactsByClient={contactsByClient}
          open
          onOpenChange={close}
        />
      )}

      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={`Delete ${dialog.opportunity.name}?`}
          description="The opportunity is removed from your pipeline. This does not affect the client."
          confirmLabel="Delete"
          successMessage="Opportunity deleted."
          onConfirm={() => deleteOpportunityAction({ opportunityId: dialog.opportunity.id })}
        />
      )}
    </>
  );
}

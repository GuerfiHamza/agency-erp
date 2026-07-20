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

import { deleteActivityAction } from '../activities.actions';
import type { ActivityListItem } from '../activities.service';
import { ACTIVITY_TYPES } from '../activities.validation';

import { ActivityFormDialog } from './activity-form-dialog';

type Option = { id: string; name: string };

interface Props {
  activities: ActivityListItem[];
  totalItems: number;
  linkOptions: { leads: Option[]; clients: Option[]; opportunities: Option[] };
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; activity: ActivityListItem }
  | { kind: 'delete'; activity: ActivityListItem };

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function humanise(value: string): string {
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function ActivitiesTable({
  activities,
  totalItems,
  linkOptions,
  canCreate,
  canUpdate,
  canDelete,
}: Props) {
  const { hasActiveFilters } = useTableParams();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });

  const close = () => setDialog({ kind: 'none' });

  const columns = useMemo<ColumnDef<ActivityListItem, unknown>[]>(
    () => [
      {
        id: 'type',
        header: 'Type',
        cell: ({ row }) => <Badge variant="secondary">{humanise(row.original.type)}</Badge>,
      },
      {
        accessorKey: 'subject',
        header: () => <DataTableColumnHeader columnId="subject" title="Subject" />,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.subject}</p>
            {row.original.body && (
              <p className="truncate text-xs text-muted-foreground">{row.original.body}</p>
            )}
          </div>
        ),
      },
      {
        id: 'related',
        header: 'Related to',
        cell: ({ row }) =>
          row.original.relatedLabel ? (
            <span className="text-sm">
              <span className="text-muted-foreground">{humanise(row.original.relatedKind)}: </span>
              {row.original.relatedLabel}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: 'occurredAt',
        header: () => <DataTableColumnHeader columnId="occurredAt" title="When" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {dateTimeFormatter.format(row.original.occurredAt)}
          </span>
        ),
      },
      {
        id: 'createdBy',
        header: 'Logged by',
        cell: ({ row }) => row.original.createdByName ?? <span className="text-muted-foreground">—</span>,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const activity = row.original;

          if (!canUpdate && !canDelete) return null;

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal aria-hidden />
                    <span className="sr-only">Actions for {activity.subject}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canUpdate && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit', activity })}>
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDialog({ kind: 'delete', activity })}
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
        data={activities}
        totalItems={totalItems}
        getRowId={(row) => row.id}
        searchPlaceholder="Search subjects..."
        statusOptions={ACTIVITY_TYPES.map((type) => ({ label: humanise(type), value: type }))}
        hasActiveFilters={hasActiveFilters}
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
              <Plus aria-hidden />
              Log activity
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            title="No activity yet"
            description="Log a call, email, meeting, or note to build a timeline."
            action={
              canCreate ? (
                <Button onClick={() => setDialog({ kind: 'create' })}>
                  <Plus aria-hidden />
                  Log activity
                </Button>
              ) : undefined
            }
          />
        }
      />

      {dialog.kind === 'create' && <ActivityFormDialog linkOptions={linkOptions} open onOpenChange={close} />}

      {dialog.kind === 'edit' && (
        <ActivityFormDialog activity={dialog.activity} linkOptions={linkOptions} open onOpenChange={close} />
      )}

      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title="Delete this activity?"
          description="The logged interaction is removed from the timeline. This cannot be undone from here."
          confirmLabel="Delete"
          successMessage="Activity deleted."
          onConfirm={() => deleteActivityAction({ activityId: dialog.activity.id })}
        />
      )}
    </>
  );
}

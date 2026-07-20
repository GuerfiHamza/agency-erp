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

import { deleteProjectAction } from '../projects.actions';
import type { ProjectListItem } from '../projects.service';
import { PROJECT_STATUSES } from '../projects.validation';

import { ProjectFormDialog } from './project-form-dialog';

interface Props {
  projects: ProjectListItem[];
  totalItems: number;
  clientOptions: { id: string; name: string }[];
  managerOptions: { id: string; name: string }[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; project: ProjectListItem }
  | { kind: 'delete'; project: ProjectListItem };

function humanise(value: string): string {
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const STATUS_VARIANT: Record<
  (typeof PROJECT_STATUSES)[number],
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  planning: 'secondary',
  active: 'default',
  on_hold: 'outline',
  completed: 'outline',
  cancelled: 'destructive',
};

const PRIORITY_VARIANT: Record<string, 'secondary' | 'default' | 'destructive'> = {
  low: 'secondary',
  medium: 'secondary',
  high: 'default',
  urgent: 'destructive',
};

export function ProjectsTable({
  projects,
  totalItems,
  clientOptions,
  managerOptions,
  canCreate,
  canUpdate,
  canDelete,
}: Props) {
  const { hasActiveFilters } = useTableParams();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });

  const close = () => setDialog({ kind: 'none' });

  const columns = useMemo<ColumnDef<ProjectListItem, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <DataTableColumnHeader columnId="name" title="Project" />,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{row.original.code}</p>
          </div>
        ),
      },
      {
        id: 'client',
        header: 'Client',
        cell: ({ row }) => row.original.clientName ?? <span className="text-muted-foreground">Internal</span>,
      },
      {
        accessorKey: 'status',
        header: () => <DataTableColumnHeader columnId="status" title="Status" />,
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]}>{humanise(row.original.status)}</Badge>
        ),
      },
      {
        id: 'priority',
        header: 'Priority',
        cell: ({ row }) => (
          <Badge variant={PRIORITY_VARIANT[row.original.priority] ?? 'secondary'}>
            {humanise(row.original.priority)}
          </Badge>
        ),
      },
      {
        id: 'manager',
        header: 'Manager',
        cell: ({ row }) =>
          row.original.managerName ?? <span className="text-muted-foreground">Unassigned</span>,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const project = row.original;

          if (!canUpdate && !canDelete) return null;

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal aria-hidden />
                    <span className="sr-only">Actions for {project.name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canUpdate && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit', project })}>
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDialog({ kind: 'delete', project })}
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
        data={projects}
        totalItems={totalItems}
        getRowId={(row) => row.id}
        searchPlaceholder="Search name or code..."
        statusOptions={PROJECT_STATUSES.map((status) => ({ label: humanise(status), value: status }))}
        hasActiveFilters={hasActiveFilters}
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
              <Plus aria-hidden />
              New project
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            title="No projects yet"
            description="Create your first project to start tracking delivery."
            action={
              canCreate ? (
                <Button onClick={() => setDialog({ kind: 'create' })}>
                  <Plus aria-hidden />
                  New project
                </Button>
              ) : undefined
            }
          />
        }
      />

      {dialog.kind === 'create' && (
        <ProjectFormDialog
          clientOptions={clientOptions}
          managerOptions={managerOptions}
          open
          onOpenChange={close}
        />
      )}

      {dialog.kind === 'edit' && (
        <ProjectFormDialog
          project={dialog.project}
          clientOptions={clientOptions}
          managerOptions={managerOptions}
          open
          onOpenChange={close}
        />
      )}

      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={`Delete ${dialog.project.name}?`}
          description="The project is removed from your lists. Tasks and time already logged against it are kept."
          confirmLabel="Delete"
          successMessage="Project deleted."
          onConfirm={() => deleteProjectAction({ projectId: dialog.project.id })}
        />
      )}
    </>
  );
}

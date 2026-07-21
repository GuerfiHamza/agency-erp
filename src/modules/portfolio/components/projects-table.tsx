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

import { deleteProjectAction } from '../portfolio.actions';
import type { PortfolioProjectRow } from '../portfolio.service';
import { PORTFOLIO_PROJECT_STATUSES } from '../portfolio.validation';

import { ProjectFormDialog } from './project-form-dialog';

interface Props {
  projects: PortfolioProjectRow[];
  totalItems: number;
  categoryOptions: { id: string; name: string }[];
  technologyOptions: { id: string; name: string }[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; project: PortfolioProjectRow }
  | { kind: 'delete'; project: PortfolioProjectRow };

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

const STATUS_VARIANT: Record<(typeof PORTFOLIO_PROJECT_STATUSES)[number], 'default' | 'secondary'> = {
  draft: 'secondary',
  published: 'default',
};

export function ProjectsTable({
  projects,
  totalItems,
  categoryOptions,
  technologyOptions,
  canCreate,
  canUpdate,
  canDelete,
}: Props) {
  const { hasActiveFilters } = useTableParams();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });

  const close = () => setDialog({ kind: 'none' });

  const columns = useMemo<ColumnDef<PortfolioProjectRow, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: () => <DataTableColumnHeader columnId="title" title="Title" />,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.title}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.shortDescription}</p>
          </div>
        ),
      },
      {
        id: 'category',
        header: 'Category',
        cell: ({ row }) => row.original.categoryName ?? <span className="text-muted-foreground">None</span>,
      },
      {
        id: 'technologies',
        header: 'Technologies',
        cell: ({ row }) => (
          <div className="flex max-w-xs flex-wrap gap-1">
            {row.original.technologies.length === 0 ? (
              <span className="text-muted-foreground">None</span>
            ) : (
              row.original.technologies.map((technology) => (
                <Badge key={technology.id} variant="outline" className="font-normal">
                  {technology.name}
                </Badge>
              ))
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
        id: 'isLive',
        header: 'Live',
        cell: ({ row }) =>
          row.original.isLive ? (
            <span className="text-success">Yes</span>
          ) : (
            <span className="text-muted-foreground">No</span>
          ),
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
          const project = row.original;

          if (!canUpdate && !canDelete) return null;

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal aria-hidden />
                    <span className="sr-only">Actions for {project.title}</span>
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
        searchPlaceholder="Search title or slug..."
        statusOptions={PORTFOLIO_PROJECT_STATUSES.map((status) => ({
          label: status.charAt(0).toUpperCase() + status.slice(1),
          value: status,
        }))}
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
            title="No portfolio projects yet"
            description="Add your first project to start showing it on neodott.com."
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
          categoryOptions={categoryOptions}
          technologyOptions={technologyOptions}
          open
          onOpenChange={close}
        />
      )}

      {dialog.kind === 'edit' && (
        <ProjectFormDialog
          project={dialog.project}
          categoryOptions={categoryOptions}
          technologyOptions={technologyOptions}
          open
          onOpenChange={close}
        />
      )}

      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={`Delete ${dialog.project.title}?`}
          description="This removes the project from the portfolio and the public API immediately."
          confirmLabel="Delete"
          successMessage="Project deleted."
          onConfirm={() => deleteProjectAction({ projectId: dialog.project.id })}
        />
      )}
    </>
  );
}

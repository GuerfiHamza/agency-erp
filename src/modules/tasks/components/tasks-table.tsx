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

import { deleteTaskAction } from '../tasks.actions';
import type { TaskListItem } from '../tasks.service';
import { TASK_STATUSES } from '../tasks.validation';

import { TaskFormDialog } from './task-form-dialog';

interface Props {
  tasks: TaskListItem[];
  totalItems: number;
  projectOptions: { id: string; name: string }[];
  assigneeOptions: { id: string; name: string }[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; task: TaskListItem }
  | { kind: 'delete'; task: TaskListItem };

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function humanise(value: string): string {
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const STATUS_VARIANT: Record<
  (typeof TASK_STATUSES)[number],
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  todo: 'secondary',
  in_progress: 'default',
  in_review: 'default',
  done: 'outline',
  cancelled: 'destructive',
};

const PRIORITY_VARIANT: Record<string, 'secondary' | 'default' | 'destructive'> = {
  low: 'secondary',
  medium: 'secondary',
  high: 'default',
  urgent: 'destructive',
};

/** A due date is "overdue" only while the task is still open. */
function isOverdue(task: TaskListItem): boolean {
  if (!task.dueDate || task.status === 'done' || task.status === 'cancelled') return false;
  return new Date(task.dueDate).getTime() < Date.now();
}

export function TasksTable({
  tasks,
  totalItems,
  projectOptions,
  assigneeOptions,
  canCreate,
  canUpdate,
  canDelete,
}: Props) {
  const { hasActiveFilters } = useTableParams();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });

  const close = () => setDialog({ kind: 'none' });

  const columns = useMemo<ColumnDef<TaskListItem, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: () => <DataTableColumnHeader columnId="title" title="Task" />,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.title}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.projectName}</p>
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
        id: 'priority',
        header: 'Priority',
        cell: ({ row }) => (
          <Badge variant={PRIORITY_VARIANT[row.original.priority] ?? 'secondary'}>
            {humanise(row.original.priority)}
          </Badge>
        ),
      },
      {
        id: 'assignee',
        header: 'Assignee',
        cell: ({ row }) =>
          row.original.assigneeName ?? <span className="text-muted-foreground">Unassigned</span>,
      },
      {
        accessorKey: 'dueDate',
        header: () => <DataTableColumnHeader columnId="dueDate" title="Due" />,
        cell: ({ row }) =>
          row.original.dueDate ? (
            <span
              className={
                isOverdue(row.original)
                  ? 'text-xs font-medium text-destructive'
                  : 'text-xs text-muted-foreground'
              }
            >
              {dateFormatter.format(row.original.dueDate)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const task = row.original;

          if (!canUpdate && !canDelete) return null;

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal aria-hidden />
                    <span className="sr-only">Actions for {task.title}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canUpdate && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit', task })}>
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDialog({ kind: 'delete', task })}
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
        data={tasks}
        totalItems={totalItems}
        getRowId={(row) => row.id}
        searchPlaceholder="Search tasks..."
        statusOptions={TASK_STATUSES.map((status) => ({ label: humanise(status), value: status }))}
        hasActiveFilters={hasActiveFilters}
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
              <Plus aria-hidden />
              New task
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            title="No tasks yet"
            description="Add a task to a project to start tracking the work."
            action={
              canCreate ? (
                <Button onClick={() => setDialog({ kind: 'create' })}>
                  <Plus aria-hidden />
                  New task
                </Button>
              ) : undefined
            }
          />
        }
      />

      {dialog.kind === 'create' && (
        <TaskFormDialog
          projectOptions={projectOptions}
          assigneeOptions={assigneeOptions}
          open
          onOpenChange={close}
        />
      )}

      {dialog.kind === 'edit' && (
        <TaskFormDialog
          task={dialog.task}
          projectOptions={projectOptions}
          assigneeOptions={assigneeOptions}
          open
          onOpenChange={close}
        />
      )}

      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={`Delete ${dialog.task.title}?`}
          description="The task is removed. Time already logged against it is kept."
          confirmLabel="Delete"
          successMessage="Task deleted."
          onConfirm={() => deleteTaskAction({ taskId: dialog.task.id })}
        />
      )}
    </>
  );
}

import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { loadTableParams } from '@/lib/table/search-params';
import { TasksTable } from '@/modules/tasks/components/tasks-table';
import * as tasks from '@/modules/tasks/tasks.service';
import { isTaskSortField, toTaskStatusFilters } from '@/modules/tasks/tasks.validation';

export const metadata: Metadata = { title: 'Tasks' };

/**
 * The work: tasks across all projects.
 *
 * Table state is read from the URL and passed straight into SQL. The auth check
 * is here rather than in a layout — layouts do not re-run on client-side
 * navigation.
 */
export default async function TasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { companyId } = await requireTenantSession();

  if (!(await can('tasks:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view tasks in this workspace."
        />
      </main>
    );
  }

  const params = await loadTableParams(searchParams);

  const [canCreate, canUpdate, canDelete] = await Promise.all([
    can('tasks:create'),
    can('tasks:update'),
    can('tasks:delete'),
  ]);

  const [page, projectOptions, assigneeOptions] = await Promise.all([
    tasks.listTasks(companyId, {
      page: params.page,
      pageSize: params.pageSize,
      search: params.q || undefined,
      sort: isTaskSortField(params.sort) ? { field: params.sort, direction: params.order } : undefined,
      statuses: toTaskStatusFilters(params.status),
    }),
    tasks.listProjectOptions(companyId),
    tasks.listAssigneeOptions(companyId),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted-foreground">
          Work across every project. Filter by status, and sort by due date to see what is next.
        </p>
      </header>

      <TasksTable
        tasks={page.items}
        totalItems={page.totalItems}
        projectOptions={projectOptions}
        assigneeOptions={assigneeOptions}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </main>
  );
}

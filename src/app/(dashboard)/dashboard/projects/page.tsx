import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { loadTableParams } from '@/lib/table/search-params';
import { ProjectsTable } from '@/modules/projects/components/projects-table';
import * as projects from '@/modules/projects/projects.service';
import { isProjectSortField, toProjectStatusFilters } from '@/modules/projects/projects.validation';

export const metadata: Metadata = { title: 'Projects' };

/**
 * Delivery work: the projects tasks, time, and invoices hang off.
 *
 * Table state is read from the URL and passed straight into SQL. The auth check
 * is here rather than in a layout — layouts do not re-run on client-side
 * navigation.
 */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { companyId } = await requireTenantSession();

  if (!(await can('projects:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view projects in this workspace."
        />
      </main>
    );
  }

  const params = await loadTableParams(searchParams);

  const [canCreate, canUpdate, canDelete] = await Promise.all([
    can('projects:create'),
    can('projects:update'),
    can('projects:delete'),
  ]);

  const [page, clientOptions, managerOptions] = await Promise.all([
    projects.listProjects(companyId, {
      page: params.page,
      pageSize: params.pageSize,
      search: params.q || undefined,
      sort: isProjectSortField(params.sort) ? { field: params.sort, direction: params.order } : undefined,
      statuses: toProjectStatusFilters(params.status),
    }),
    projects.listClientOptions(companyId),
    projects.listManagerOptions(companyId),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-sm text-muted-foreground">
          Client and internal delivery work. Each gets a code automatically; tasks and invoices attach here.
        </p>
      </header>

      <ProjectsTable
        projects={page.items}
        totalItems={page.totalItems}
        clientOptions={clientOptions}
        managerOptions={managerOptions}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </main>
  );
}

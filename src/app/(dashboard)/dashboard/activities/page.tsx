import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { loadTableParams } from '@/lib/table/search-params';
import { ActivitiesTable } from '@/modules/crm/components/activities-table';
import * as activities from '@/modules/crm/activities.service';
import { isActivitySortField, toActivityTypeFilters } from '@/modules/crm/activities.validation';

export const metadata: Metadata = { title: 'Activities' };

/**
 * The interaction timeline: calls, emails, meetings, and notes.
 *
 * Table state is read from the URL and passed straight into SQL. The auth check
 * is here rather than in a layout — layouts do not re-run on client-side
 * navigation.
 */
export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { companyId } = await requireTenantSession();

  if (!(await can('activities:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view activities in this workspace."
        />
      </main>
    );
  }

  const params = await loadTableParams(searchParams);

  const [canCreate, canUpdate, canDelete] = await Promise.all([
    can('activities:create'),
    can('activities:update'),
    can('activities:delete'),
  ]);

  const [page, linkOptions] = await Promise.all([
    activities.listActivities(companyId, {
      page: params.page,
      pageSize: params.pageSize,
      search: params.q || undefined,
      sort: isActivitySortField(params.sort) ? { field: params.sort, direction: params.order } : undefined,
      types: toActivityTypeFilters(params.status),
    }),
    activities.listLinkOptions(companyId),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Activities</h1>
        <p className="text-sm text-muted-foreground">
          Every logged interaction, newest first. Link each one to a lead, client, or opportunity.
        </p>
      </header>

      <ActivitiesTable
        activities={page.items}
        totalItems={page.totalItems}
        linkOptions={linkOptions}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </main>
  );
}

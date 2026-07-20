import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { loadTableParams } from '@/lib/table/search-params';
import { OpportunitiesTable } from '@/modules/crm/components/opportunities-table';
import * as opportunities from '@/modules/crm/opportunities.service';
import { isOpportunitySortField, toOpportunityStageFilters } from '@/modules/crm/opportunities.validation';

export const metadata: Metadata = { title: 'Opportunities' };

/**
 * Qualified deals in the pipeline.
 *
 * Table state is read from the URL and passed straight into SQL. The auth check
 * is here rather than in a layout — layouts do not re-run on client-side
 * navigation.
 */
export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { companyId } = await requireTenantSession();

  if (!(await can('opportunities:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view opportunities in this workspace."
        />
      </main>
    );
  }

  const params = await loadTableParams(searchParams);

  const [canCreate, canUpdate, canDelete] = await Promise.all([
    can('opportunities:create'),
    can('opportunities:update'),
    can('opportunities:delete'),
  ]);

  const [page, clientOptions, ownerOptions, contactsByClient] = await Promise.all([
    opportunities.listOpportunities(companyId, {
      page: params.page,
      pageSize: params.pageSize,
      search: params.q || undefined,
      sort: isOpportunitySortField(params.sort) ? { field: params.sort, direction: params.order } : undefined,
      stages: toOpportunityStageFilters(params.status),
    }),
    opportunities.listClientOptions(companyId),
    opportunities.listOwnerOptions(companyId),
    opportunities.listContactsByClient(companyId),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Opportunities</h1>
        <p className="text-sm text-muted-foreground">
          Qualified deals, each attached to a client. Move them through the stages to won or lost.
        </p>
      </header>

      <OpportunitiesTable
        opportunities={page.items}
        totalItems={page.totalItems}
        clientOptions={clientOptions}
        ownerOptions={ownerOptions}
        contactsByClient={contactsByClient}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </main>
  );
}

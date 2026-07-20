import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { loadTableParams } from '@/lib/table/search-params';
import { LeadsTable } from '@/modules/crm/components/leads-table';
import * as leads from '@/modules/crm/leads.service';
import { isLeadSortField, toLeadStatusFilters } from '@/modules/crm/leads.validation';

export const metadata: Metadata = { title: 'Leads' };

/**
 * The top of the funnel: enquiries before they become clients.
 *
 * Table state is read from the URL and passed straight into SQL. The auth check
 * is here rather than in a layout — layouts do not re-run on client-side
 * navigation.
 */
export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { companyId } = await requireTenantSession();

  if (!(await can('leads:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view leads in this workspace."
        />
      </main>
    );
  }

  const params = await loadTableParams(searchParams);

  const [canCreate, canUpdate, canDelete, canCreateClient] = await Promise.all([
    can('leads:create'),
    can('leads:update'),
    can('leads:delete'),
    can('clients:create'),
  ]);

  const [page, ownerOptions] = await Promise.all([
    leads.listLeads(companyId, {
      page: params.page,
      pageSize: params.pageSize,
      search: params.q || undefined,
      sort: isLeadSortField(params.sort) ? { field: params.sort, direction: params.order } : undefined,
      statuses: toLeadStatusFilters(params.status),
    }),
    leads.listOwnerOptions(companyId),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="text-sm text-muted-foreground">
          Unqualified enquiries. Qualify and convert them into clients when a deal is real.
        </p>
      </header>

      <LeadsTable
        leads={page.items}
        totalItems={page.totalItems}
        ownerOptions={ownerOptions}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
        canConvert={canUpdate && canCreateClient}
      />
    </main>
  );
}

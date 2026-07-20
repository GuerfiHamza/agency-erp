import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { loadTableParams } from '@/lib/table/search-params';
import { ClientsTable } from '@/modules/clients/components/clients-table';
import * as clients from '@/modules/clients/clients.service';
import { isClientSortField, toClientStatusFilters } from '@/modules/clients/clients.validation';

export const metadata: Metadata = { title: 'Clients' };

/**
 * The agency's clients.
 *
 * Table state is read from the URL and passed straight into SQL, so a shared
 * link to a filtered, sorted page fetches exactly that on first paint. The auth
 * check is here rather than in a layout — layouts do not re-run on client-side
 * navigation.
 */
export default async function ClientsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { companyId } = await requireTenantSession();

  if (!(await can('clients:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view clients in this workspace."
        />
      </main>
    );
  }

  const params = await loadTableParams(searchParams);

  const [canCreate, canUpdate, canDelete, canExport] = await Promise.all([
    can('clients:create'),
    can('clients:update'),
    can('clients:delete'),
    can('clients:export'),
  ]);

  const [page, ownerOptions] = await Promise.all([
    clients.listClients(companyId, {
      page: params.page,
      pageSize: params.pageSize,
      search: params.q || undefined,
      // An unrecognised ?sort= falls back to the default rather than throwing.
      sort: isClientSortField(params.sort) ? { field: params.sort, direction: params.order } : undefined,
      statuses: toClientStatusFilters(params.status),
    }),
    clients.listOwnerOptions(companyId),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <p className="text-sm text-muted-foreground">
          The companies and people you work for. Quotes, invoices, and projects hang off these.
        </p>
      </header>

      <ClientsTable
        clients={page.items}
        totalItems={page.totalItems}
        ownerOptions={ownerOptions}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
        canExport={canExport}
      />
    </main>
  );
}

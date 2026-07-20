import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { loadTableParams } from '@/lib/table/search-params';
import { SuppliersTable } from '@/modules/suppliers/components/suppliers-table';
import * as suppliers from '@/modules/suppliers/suppliers.service';
import { isSupplierSortField, toSupplierStatusFilters } from '@/modules/suppliers/suppliers.validation';

export const metadata: Metadata = { title: 'Suppliers' };

/**
 * The agency's suppliers — the counterpart to Clients on the purchasing
 * side. Table state is read from the URL and passed straight into SQL, same
 * as every other Phase 5 list. The auth check is here rather than in a
 * layout — layouts do not re-run on client-side navigation.
 */
export default async function SuppliersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { companyId } = await requireTenantSession();

  if (!(await can('suppliers:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view suppliers in this workspace."
        />
      </main>
    );
  }

  const params = await loadTableParams(searchParams);

  const [canCreate, canUpdate, canDelete] = await Promise.all([
    can('suppliers:create'),
    can('suppliers:update'),
    can('suppliers:delete'),
  ]);

  const page = await suppliers.listSuppliers(companyId, {
    page: params.page,
    pageSize: params.pageSize,
    search: params.q || undefined,
    sort: isSupplierSortField(params.sort) ? { field: params.sort, direction: params.order } : undefined,
    statuses: toSupplierStatusFilters(params.status),
  });

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Suppliers</h1>
        <p className="text-sm text-muted-foreground">
          The vendors the agency buys from. Purchase orders hang off these.
        </p>
      </header>

      <SuppliersTable
        suppliers={page.items}
        totalItems={page.totalItems}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </main>
  );
}

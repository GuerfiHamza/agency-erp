import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { loadTableParams } from '@/lib/table/search-params';
import * as companies from '@/modules/companies/companies.service';
import { ProformaInvoicesTable } from '@/modules/proforma-invoices/components/proforma-invoices-table';
import * as proformas from '@/modules/proforma-invoices/proforma-invoices.service';
import {
  isProformaSortField,
  toProformaStatusFilters,
} from '@/modules/proforma-invoices/proforma-invoices.validation';

export const metadata: Metadata = { title: 'Proforma Invoices' };

/**
 * Proforma invoices — a commitment to invoice, not a receivable, so it never
 * feeds revenue/aging reports (see the schema comment on the table). Same URL-
 * driven table state as every other Phase 5 list.
 */
export default async function ProformaInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { companyId } = await requireTenantSession();

  if (!(await can('proforma_invoices:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view proforma invoices in this workspace."
        />
      </main>
    );
  }

  const params = await loadTableParams(searchParams);

  const [canCreate, canUpdate, canDelete, canSend, canExport, canCreateInvoice] = await Promise.all([
    can('proforma_invoices:create'),
    can('proforma_invoices:update'),
    can('proforma_invoices:delete'),
    can('proforma_invoices:send'),
    can('proforma_invoices:export'),
    can('invoices:create'),
  ]);

  const [page, clientOptions, projectOptions, contactsByClient, company] = await Promise.all([
    proformas.listProformas(companyId, {
      page: params.page,
      pageSize: params.pageSize,
      search: params.q || undefined,
      sort: isProformaSortField(params.sort) ? { field: params.sort, direction: params.order } : undefined,
      statuses: toProformaStatusFilters(params.status),
    }),
    proformas.listClientOptions(companyId),
    proformas.listProjectOptions(companyId),
    proformas.listContactsByClient(companyId),
    companies.getCompany(companyId),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Proforma Invoices</h1>
        <p className="text-sm text-muted-foreground">
          A commitment to invoice, not a receivable — draft one directly or convert an accepted quote.
        </p>
      </header>

      <ProformaInvoicesTable
        proformas={page.items}
        totalItems={page.totalItems}
        clientOptions={clientOptions}
        projectOptions={projectOptions}
        contactsByClient={contactsByClient}
        defaultCurrency={company.defaultCurrency}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
        canSend={canSend}
        canExport={canExport}
        canCreateInvoice={canCreateInvoice}
      />
    </main>
  );
}

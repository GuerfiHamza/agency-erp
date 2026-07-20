import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { loadTableParams } from '@/lib/table/search-params';
import * as companies from '@/modules/companies/companies.service';
import { InvoicesTable } from '@/modules/invoices/components/invoices-table';
import * as invoices from '@/modules/invoices/invoices.service';
import { isInvoiceSortField, toInvoiceStatusFilters } from '@/modules/invoices/invoices.validation';

export const metadata: Metadata = { title: 'Invoices' };

/**
 * Invoices — the receivable and the legal record. Once sent, an invoice's
 * content is locked in the service; this page never exposes a status
 * dropdown, only dedicated send/void/cancel actions. Same URL-driven table
 * state as every other Phase 5 list.
 */
export default async function InvoicesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { companyId } = await requireTenantSession();

  if (!(await can('invoices:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view invoices in this workspace."
        />
      </main>
    );
  }

  const params = await loadTableParams(searchParams);

  const [canCreate, canUpdate, canDelete, canSend, canExport] = await Promise.all([
    can('invoices:create'),
    can('invoices:update'),
    can('invoices:delete'),
    can('invoices:send'),
    can('invoices:export'),
  ]);

  const [page, clientOptions, projectOptions, contactsByClient, company] = await Promise.all([
    invoices.listInvoices(companyId, {
      page: params.page,
      pageSize: params.pageSize,
      search: params.q || undefined,
      sort: isInvoiceSortField(params.sort) ? { field: params.sort, direction: params.order } : undefined,
      statuses: toInvoiceStatusFilters(params.status),
    }),
    invoices.listClientOptions(companyId),
    invoices.listProjectOptions(companyId),
    invoices.listContactsByClient(companyId),
    companies.getCompany(companyId),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="text-sm text-muted-foreground">
          The receivable. Once sent, an invoice is the legal record — void it to reverse, never delete.
        </p>
      </header>

      <InvoicesTable
        invoices={page.items}
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
      />
    </main>
  );
}

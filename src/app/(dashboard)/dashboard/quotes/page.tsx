import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { loadTableParams } from '@/lib/table/search-params';
import * as companies from '@/modules/companies/companies.service';
import { QuotesTable } from '@/modules/quotes/components/quotes-table';
import * as quotes from '@/modules/quotes/quotes.service';
import { isQuoteSortField, toQuoteStatusFilters } from '@/modules/quotes/quotes.validation';

export const metadata: Metadata = { title: 'Quotes' };

/**
 * Quotes — the first commercial document. Table state is read from the URL,
 * same as every other Phase 5 list. The auth check is here, not in a layout —
 * layouts do not re-run on client-side navigation.
 */
export default async function QuotesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { companyId } = await requireTenantSession();

  if (!(await can('quotes:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view quotes in this workspace."
        />
      </main>
    );
  }

  const params = await loadTableParams(searchParams);

  const [canCreate, canUpdate, canDelete, canSend, canExport, canCreateProforma, canCreateInvoice] =
    await Promise.all([
      can('quotes:create'),
      can('quotes:update'),
      can('quotes:delete'),
      can('quotes:send'),
      can('quotes:export'),
      can('proforma_invoices:create'),
      can('invoices:create'),
    ]);

  const [page, clientOptions, opportunityOptions, projectOptions, contactsByClient, company] =
    await Promise.all([
      quotes.listQuotes(companyId, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.q || undefined,
        sort: isQuoteSortField(params.sort) ? { field: params.sort, direction: params.order } : undefined,
        statuses: toQuoteStatusFilters(params.status),
      }),
      quotes.listClientOptions(companyId),
      quotes.listOpportunityOptions(companyId),
      quotes.listProjectOptions(companyId),
      quotes.listContactsByClient(companyId),
      companies.getCompany(companyId),
    ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Quotes</h1>
        <p className="text-sm text-muted-foreground">
          Draft, send, and track quotes before they become invoices.
        </p>
      </header>

      <QuotesTable
        quotes={page.items}
        totalItems={page.totalItems}
        clientOptions={clientOptions}
        opportunityOptions={opportunityOptions}
        projectOptions={projectOptions}
        contactsByClient={contactsByClient}
        defaultCurrency={company.defaultCurrency}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
        canSend={canSend}
        canExport={canExport}
        canCreateProforma={canCreateProforma}
        canCreateInvoice={canCreateInvoice}
      />
    </main>
  );
}

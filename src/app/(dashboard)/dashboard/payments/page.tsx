import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { loadTableParams } from '@/lib/table/search-params';
import { PaymentsTable } from '@/modules/payments/components/payments-table';
import * as payments from '@/modules/payments/payments.service';
import {
  isPaymentSortField,
  toPaymentDirectionFilters,
  toPaymentStatusFilters,
} from '@/modules/payments/payments.validation';

export const metadata: Metadata = { title: 'Payments' };

/**
 * Payments — money that has moved, or is expected to, in either direction.
 * The single writer to `invoices.amountPaid` (see MEMORY.md); this page
 * never exposes a status dropdown, only the dedicated complete/fail/refund
 * actions. The toolbar's one filter slot is repurposed for `direction` —
 * see the validation module note.
 */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { companyId } = await requireTenantSession();

  if (!(await can('payments:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view payments in this workspace."
        />
      </main>
    );
  }

  const params = await loadTableParams(searchParams);

  const [canCreate, canUpdate, canDelete, canExport] = await Promise.all([
    can('payments:create'),
    can('payments:update'),
    can('payments:delete'),
    can('payments:export'),
  ]);

  const [page, payableInvoices, payablePurchaseOrders] = await Promise.all([
    payments.listPayments(companyId, {
      page: params.page,
      pageSize: params.pageSize,
      search: params.q || undefined,
      sort: isPaymentSortField(params.sort) ? { field: params.sort, direction: params.order } : undefined,
      statuses: toPaymentStatusFilters(params.status),
      directions: toPaymentDirectionFilters(params.status),
    }),
    payments.listPayableInvoices(companyId),
    payments.listPayablePurchaseOrders(companyId),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Money received from clients and paid to suppliers. Completing an inbound payment updates the invoice
          it settles.
        </p>
      </header>

      <PaymentsTable
        payments={page.items}
        totalItems={page.totalItems}
        payableInvoices={payableInvoices}
        payablePurchaseOrders={payablePurchaseOrders}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
        canExport={canExport}
      />
    </main>
  );
}

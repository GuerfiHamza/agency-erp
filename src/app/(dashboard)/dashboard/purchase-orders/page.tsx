import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { loadTableParams } from '@/lib/table/search-params';
import * as companies from '@/modules/companies/companies.service';
import { PurchaseOrdersTable } from '@/modules/purchase-orders/components/purchase-orders-table';
import * as purchaseOrders from '@/modules/purchase-orders/purchase-orders.service';
import {
  isPurchaseOrderSortField,
  toPurchaseOrderStatusFilters,
} from '@/modules/purchase-orders/purchase-orders.validation';

export const metadata: Metadata = { title: 'Purchase Orders' };

/**
 * Purchase Orders — the outbound counterpart to Invoices. Once sent, content
 * is locked in the service; this page never exposes a status dropdown, only
 * dedicated send/approve/confirm/receive/cancel actions. Same URL-driven
 * table state as every other Phase 5 list.
 */
export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { companyId } = await requireTenantSession();

  if (!(await can('purchase_orders:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view purchase orders in this workspace."
        />
      </main>
    );
  }

  const params = await loadTableParams(searchParams);

  const [canCreate, canUpdate, canDelete, canSend, canApprove] = await Promise.all([
    can('purchase_orders:create'),
    can('purchase_orders:update'),
    can('purchase_orders:delete'),
    can('purchase_orders:send'),
    can('purchase_orders:approve'),
  ]);

  const [page, supplierOptions, projectOptions, company] = await Promise.all([
    purchaseOrders.listPurchaseOrders(companyId, {
      page: params.page,
      pageSize: params.pageSize,
      search: params.q || undefined,
      sort: isPurchaseOrderSortField(params.sort)
        ? { field: params.sort, direction: params.order }
        : undefined,
      statuses: toPurchaseOrderStatusFilters(params.status),
    }),
    purchaseOrders.listSupplierOptions(companyId),
    purchaseOrders.listProjectOptions(companyId),
    companies.getCompany(companyId),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Purchase Orders</h1>
        <p className="text-sm text-muted-foreground">
          Order stock or services from a supplier. Once sent, edit is locked — cancel to reverse a draft that
          never shipped, receive to record what arrives.
        </p>
      </header>

      <PurchaseOrdersTable
        purchaseOrders={page.items}
        totalItems={page.totalItems}
        supplierOptions={supplierOptions}
        projectOptions={projectOptions}
        defaultCurrency={company.defaultCurrency}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
        canSend={canSend}
        canApprove={canApprove}
      />
    </main>
  );
}

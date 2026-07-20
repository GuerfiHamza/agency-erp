import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { loadTableParams } from '@/lib/table/search-params';
import * as companies from '@/modules/companies/companies.service';
import { ExpensesTable } from '@/modules/expenses/components/expenses-table';
import * as expenses from '@/modules/expenses/expenses.service';
import { isExpenseSortField, toExpenseStatusFilters } from '@/modules/expenses/expenses.validation';

export const metadata: Metadata = { title: 'Expenses' };

/**
 * Expenses — draft → submitted → approved | rejected, then reimbursed once
 * approved. Same URL-driven table state and content-lock-once-submitted
 * posture as every other Phase 5 list.
 */
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { companyId, userId } = await requireTenantSession();

  if (!(await can('expenses:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view expenses in this workspace."
        />
      </main>
    );
  }

  const params = await loadTableParams(searchParams);

  const [canCreate, canUpdate, canDelete, canApprove] = await Promise.all([
    can('expenses:create'),
    can('expenses:update'),
    can('expenses:delete'),
    can('expenses:approve'),
  ]);

  const [page, projectOptions, supplierOptions, userOptions, company] = await Promise.all([
    expenses.listExpenses(companyId, {
      page: params.page,
      pageSize: params.pageSize,
      search: params.q || undefined,
      sort: isExpenseSortField(params.sort) ? { field: params.sort, direction: params.order } : undefined,
      statuses: toExpenseStatusFilters(params.status),
    }),
    expenses.listProjectOptions(companyId),
    expenses.listSupplierOptions(companyId),
    expenses.listUserOptions(companyId),
    companies.getCompany(companyId),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <p className="text-sm text-muted-foreground">
          Costs incurred by the team, with an approval trail. Mark a project-billable expense so it can be
          re-charged.
        </p>
      </header>

      <ExpensesTable
        expenses={page.items}
        totalItems={page.totalItems}
        currentUserId={userId}
        defaultCurrency={company.defaultCurrency}
        projectOptions={projectOptions}
        supplierOptions={supplierOptions}
        userOptions={userOptions}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
        canApprove={canApprove}
      />
    </main>
  );
}

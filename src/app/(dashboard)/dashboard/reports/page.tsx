import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { ReportView } from '@/modules/reports/components/report-view';
import * as reports from '@/modules/reports/reports.service';
import {
  isReportType,
  REPORT_TYPES,
  resolveDateRange,
  toDateParam,
  type ReportType,
} from '@/modules/reports/reports.validation';

export const metadata: Metadata = { title: 'Reports' };

const REPORT_LABELS: Record<ReportType, string> = {
  revenue: 'Revenue',
  expenses: 'Expenses',
  profit_loss: 'Profit & loss',
  project_profitability: 'Project profitability',
  client_activity: 'Client activity',
  team_utilization: 'Team utilization',
  invoice_aging: 'Invoice aging',
};

/**
 * Reports — computed on demand from the operational tables, never stored
 * (see the `saved_reports` schema comment). No DataTable: each report is its
 * own small aggregate, not a paginated record list.
 *
 * State lives entirely in the URL (`?type=&from=&to=`), same posture as
 * Calendar's `?month=` — tabs are plain links and the date range is a native
 * GET form, so the page needs no client JS to be fully navigable.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; from?: string; to?: string }>;
}) {
  const { companyId } = await requireTenantSession();

  if (!(await can('reports:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view reports in this workspace."
        />
      </main>
    );
  }

  const query = await searchParams;
  const type: ReportType = isReportType(query.type) ? query.type : 'revenue';
  const range = resolveDateRange(query.from, query.to);
  const fromParam = toDateParam(range.from);
  const toParam = toDateParam(range.to);

  const [canExport, report] = await Promise.all([
    can('reports:export'),
    reports.getReport(companyId, type, range),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Revenue, cost, and delivery numbers computed live from the workspace&apos;s own records.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-1 border-b border-border pb-px">
        {REPORT_TYPES.map((option) => (
          <Link
            key={option}
            href={`?type=${option}&from=${fromParam}&to=${toParam}`}
            className={cn(
              'rounded-t-md px-3 py-2 text-sm font-medium transition-colors',
              option === type
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {REPORT_LABELS[option]}
          </Link>
        ))}
      </div>

      {type !== 'invoice_aging' && (
        <form
          method="get"
          className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3 glass"
        >
          <input type="hidden" name="type" value={type} />
          <div className="space-y-1">
            <label htmlFor="from" className="text-xs font-medium text-muted-foreground">
              From
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={fromParam}
              className="block h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="to" className="text-xs font-medium text-muted-foreground">
              To
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={toParam}
              className="block h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            />
          </div>
          <Button type="submit" variant="outline" size="sm">
            Apply
          </Button>
        </form>
      )}

      {type === 'invoice_aging' && (
        <p className="text-xs text-muted-foreground">
          A snapshot of outstanding invoices as of today — the date range above does not apply here.
        </p>
      )}

      <ReportView report={report} from={fromParam} to={toParam} canExport={canExport} />
    </main>
  );
}

import Decimal from 'decimal.js';
import { Banknote, FolderKanban, ListChecks, Receipt } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Progress } from '@/components/ui/progress';
import { can, requireTenantSession } from '@/lib/auth/session';
import * as activitiesService from '@/modules/crm/activities.service';
import * as calendarService from '@/modules/calendar/calendar.service';
import * as companiesService from '@/modules/companies/companies.service';
import { ActiveProjectsPanel } from '@/modules/dashboard/components/active-projects-panel';
import { KpiTile } from '@/modules/dashboard/components/kpi-tile';
import { QuickActionsMenu } from '@/modules/dashboard/components/quick-actions-menu';
import { RecentActivityPanel } from '@/modules/dashboard/components/recent-activity-panel';
import { RevenueChart } from '@/modules/dashboard/components/revenue-chart';
import { UpcomingDeadlinesPanel } from '@/modules/dashboard/components/upcoming-deadlines-panel';
import * as dashboardService from '@/modules/dashboard/dashboard.service';
import { SignOutButton } from '@/modules/auth/components/sign-out-button';
import * as reportsService from '@/modules/reports/reports.service';
import { resolveDateRange, toDateParam } from '@/modules/reports/reports.validation';

export const metadata: Metadata = { title: 'Dashboard' };

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * The real dashboard (Phase 6), replacing the Phase 3 placeholder. Every
 * number here is a live query against a Phase 5 module — no mock data.
 *
 * Each widget is gated by the permission of the resource it shows
 * (`reports:read`, `invoices:read`, `projects:read`, `tasks:read`,
 * `activities:read`, `calendar:read`), not a `dashboard` permission of its
 * own — there is nothing on this page a `can()` check elsewhere doesn't
 * already cover, so adding one would just be a second name for the same
 * gate. A `member` role therefore sees projects/tasks/activity/calendar but
 * not revenue or invoices, same as if they had opened those modules directly.
 */
export default async function DashboardPage() {
  const { companyId } = await requireTenantSession();

  const [
    canViewReports,
    canViewInvoices,
    canViewProjects,
    canViewTasks,
    canViewActivities,
    canViewCalendar,
    canCreateClient,
    canCreateProject,
    canCreateTask,
    canCreateInvoice,
  ] = await Promise.all([
    can('reports:read'),
    can('invoices:read'),
    can('projects:read'),
    can('tasks:read'),
    can('activities:read'),
    can('calendar:read'),
    can('clients:create'),
    can('projects:create'),
    can('tasks:create'),
    can('invoices:create'),
  ]);

  const company = await companiesService.getCompany(companyId);

  const now = new Date();
  const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const revenueRange = resolveDateRange(toDateParam(sixMonthsAgo), toDateParam(now));

  const [revenue, invoiceAging, projectsOverview, taskWorkload, recentActivity, upcomingEvents] =
    await Promise.all([
      canViewReports ? reportsService.getReport(companyId, 'revenue', revenueRange) : null,
      // `invoice_aging` ignores its range argument (it's a snapshot as of now); reused here only
      // because the function signature requires one.
      canViewInvoices ? reportsService.getReport(companyId, 'invoice_aging', revenueRange) : null,
      canViewProjects ? dashboardService.getActiveProjectsOverview(companyId, 4) : null,
      canViewTasks ? dashboardService.getTaskWorkload(companyId) : null,
      canViewActivities ? activitiesService.listActivities(companyId, { page: 1, pageSize: 6 }) : null,
      canViewCalendar
        ? calendarService.listEventsInRange(companyId, now, new Date(now.getTime() + FOURTEEN_DAYS_MS))
        : null,
    ]);

  const currencyFormatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: company.defaultCurrency,
    maximumFractionDigits: 0,
  });

  const revenueRows = revenue?.type === 'revenue' ? revenue.data.rows : [];
  const thisMonth = revenueRows.at(-1);
  const lastMonth = revenueRows.at(-2);
  const revenueChange =
    thisMonth && lastMonth && Number(lastMonth.total) > 0
      ? new Decimal(thisMonth.total).minus(lastMonth.total).div(lastMonth.total).times(100).toDecimalPlaces(1)
      : null;

  const outstandingTotal =
    invoiceAging?.type === 'invoice_aging'
      ? invoiceAging.data.buckets.reduce((sum, bucket) => sum.plus(bucket.total), new Decimal(0))
      : new Decimal(0);
  const outstandingCount = invoiceAging?.type === 'invoice_aging' ? invoiceAging.data.invoices.length : 0;

  const workloadPercent =
    taskWorkload && taskWorkload.totalCount > 0
      ? Math.round((taskWorkload.openCount / taskWorkload.totalCount) * 100)
      : 0;

  return (
    <main className="max-w-container-max mx-auto w-full space-y-gutter p-gutter">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agency Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">Real-time numbers from every workspace module.</p>
        </div>
        <div className="flex items-center gap-3">
          {canViewReports && (
            <Link
              href="/dashboard/reports"
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-muted"
            >
              View reports
            </Link>
          )}
          <SignOutButton />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-4">
        {canViewReports && thisMonth && (
          <KpiTile
            icon={Banknote}
            label="Revenue this month"
            value={currencyFormatter.format(Number(thisMonth.total))}
            footer={
              revenueChange ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    revenueChange.gte(0) ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                  }`}
                >
                  {revenueChange.gte(0) ? '+' : ''}
                  {revenueChange.toString()}% vs last month
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">No prior month to compare</span>
              )
            }
            href="/dashboard/reports"
          />
        )}

        {canViewProjects && (
          <KpiTile
            icon={FolderKanban}
            label="Active projects"
            value={String(projectsOverview?.activeCount ?? 0)}
            footer={<span className="text-xs text-muted-foreground">Currently in delivery</span>}
            href="/dashboard/projects"
          />
        )}

        {canViewInvoices && (
          <KpiTile
            icon={Receipt}
            label="Outstanding invoices"
            value={String(outstandingCount)}
            footer={
              outstandingCount > 0 ? (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                  {currencyFormatter.format(outstandingTotal.toNumber())} awaiting payment
                </span>
              ) : (
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                  All settled
                </span>
              )
            }
            href="/dashboard/reports?type=invoice_aging"
          />
        )}

        {canViewTasks && taskWorkload && (
          <KpiTile
            icon={ListChecks}
            label="Open work"
            value={`${workloadPercent}%`}
            footer={
              <div className="w-full space-y-1.5">
                <Progress value={workloadPercent} className="h-1.5" />
                <span className="text-xs text-muted-foreground">
                  {taskWorkload.openCount} of {taskWorkload.totalCount} tasks open
                </span>
              </div>
            }
            href="/dashboard/tasks"
          />
        )}
      </div>

      <div className="grid grid-cols-12 gap-gutter">
        {canViewReports && (
          <section className="col-span-12 flex min-h-[380px] flex-col rounded-2xl border border-border p-gutter glass lg:col-span-8">
            <div className="mb-6">
              <h2 className="text-base font-semibold">Revenue overview</h2>
              <p className="text-sm text-muted-foreground">Last six months, from issued invoices.</p>
            </div>
            <div className="flex-1">
              <RevenueChart rows={revenueRows} currency={company.defaultCurrency} />
            </div>
          </section>
        )}

        {canViewProjects && (
          <section className="col-span-12 rounded-2xl border border-border p-gutter glass lg:col-span-4">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-base font-semibold">Active projects</h2>
              <Link href="/dashboard/projects" className="text-xs font-medium text-primary hover:underline">
                View all
              </Link>
            </div>
            <ActiveProjectsPanel projects={projectsOverview?.rows ?? []} />
          </section>
        )}

        {canViewActivities && (
          <section className="col-span-12 rounded-2xl border border-border p-gutter glass lg:col-span-6">
            <h2 className="mb-6 text-base font-semibold">Recent activity</h2>
            <RecentActivityPanel activities={recentActivity?.items ?? []} />
          </section>
        )}

        {canViewCalendar && (
          <section className="col-span-12 rounded-2xl border border-border p-gutter glass lg:col-span-6">
            <h2 className="mb-6 text-base font-semibold">Upcoming deadlines</h2>
            <UpcomingDeadlinesPanel events={upcomingEvents ?? []} timezone={company.timezone} />
          </section>
        )}
      </div>

      <QuickActionsMenu
        canCreateClient={canCreateClient}
        canCreateProject={canCreateProject}
        canCreateTask={canCreateTask}
        canCreateInvoice={canCreateInvoice}
      />
    </main>
  );
}

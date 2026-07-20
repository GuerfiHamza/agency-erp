import Decimal from 'decimal.js';
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { db } from '@/db';
import { activities, clients, expenses, invoices, projects, tasks, timeEntries, user } from '@/db/schema';

import {
  AGING_BUCKETS,
  agingBucket,
  enumerateMonths,
  type AgingBucket,
  type DateRange,
} from './reports.validation';

/**
 * Report data access. Queries the operational tables directly rather than
 * through each module's service — these are cross-cutting aggregates, not
 * tenant-guarded single-record lookups, the same posture Purchase Orders takes
 * toward `suppliers`.
 *
 * A single SQL `sum()` over one table's own column is exact and never needs
 * `decimal.js` (Postgres `numeric` sums exactly). `decimal.js` only appears
 * where this module combines two *independently aggregated* values — e.g.
 * revenue minus expenses per month — matching the money rule everywhere else
 * in the codebase.
 */

const INVOICE_ISSUED_STATUSES = ['sent', 'partially_paid', 'paid', 'overdue'] as const;
const INVOICE_OUTSTANDING_STATUSES = ['sent', 'partially_paid', 'overdue'] as const;
const EXPENSE_REAL_STATUSES = ['submitted', 'approved', 'reimbursed'] as const;

export interface MonthAmount {
  month: string;
  total: string;
}

function zeroFillMonths(rows: MonthAmount[], range: DateRange): MonthAmount[] {
  const byMonth = new Map(rows.map((row) => [row.month, row.total]));

  return enumerateMonths(range.from, range.to).map((month) => ({
    month,
    total: byMonth.get(month) ?? '0.00',
  }));
}

const monthExpr = (column: AnyPgColumn) => sql<string>`to_char(date_trunc('month', ${column}), 'YYYY-MM')`;

/**
 * A raw `sql` aggregate is not parsed by the driver the way a typed timestamp
 * column is — it comes back as Postgres's text representation
 * (`"2025-01-01 00:00:00+00"`), not a `Date`. The offset is missing its
 * colon, which `Date` otherwise parses fine once given a `T` separator.
 */
function parseTimestamptz(value: unknown): Date {
  if (value instanceof Date) return value;

  const text = String(value);
  const withColon = /[+-]\d{2}$/.test(text) ? `${text}:00` : text;

  return new Date(withColon.replace(' ', 'T'));
}

async function queryRevenueByMonth(companyId: string, range: DateRange): Promise<MonthAmount[]> {
  const month = monthExpr(invoices.issueDate);

  const rows = await db
    .select({ month, total: sql<string>`coalesce(sum(${invoices.total}), 0)` })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
        isNull(invoices.deletedAt),
        inArray(invoices.status, INVOICE_ISSUED_STATUSES),
        gte(invoices.issueDate, range.from),
        lte(invoices.issueDate, range.to),
      ),
    )
    .groupBy(month)
    .orderBy(month);

  return zeroFillMonths(rows, range);
}

async function queryExpensesByMonth(companyId: string, range: DateRange): Promise<MonthAmount[]> {
  const month = monthExpr(expenses.spentOn);

  const rows = await db
    .select({ month, total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(
      and(
        eq(expenses.companyId, companyId),
        isNull(expenses.deletedAt),
        inArray(expenses.status, EXPENSE_REAL_STATUSES),
        gte(expenses.spentOn, range.from),
        lte(expenses.spentOn, range.to),
      ),
    )
    .groupBy(month)
    .orderBy(month);

  return zeroFillMonths(rows, range);
}

export interface RevenueReport {
  rows: MonthAmount[];
  summary: { totalRevenue: string };
}

export async function getRevenueReport(companyId: string, range: DateRange): Promise<RevenueReport> {
  const rows = await queryRevenueByMonth(companyId, range);
  const totalRevenue = rows.reduce((sum, row) => sum.plus(row.total), new Decimal(0));

  return { rows, summary: { totalRevenue: totalRevenue.toFixed(2) } };
}

export interface CategoryAmount {
  category: string;
  total: string;
}

export interface ExpensesReport {
  rows: MonthAmount[];
  byCategory: CategoryAmount[];
  summary: { totalExpenses: string };
}

export async function getExpensesReport(companyId: string, range: DateRange): Promise<ExpensesReport> {
  const rows = await queryExpensesByMonth(companyId, range);
  const totalExpenses = rows.reduce((sum, row) => sum.plus(row.total), new Decimal(0));

  const byCategory = await db
    .select({ category: expenses.category, total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(
      and(
        eq(expenses.companyId, companyId),
        isNull(expenses.deletedAt),
        inArray(expenses.status, EXPENSE_REAL_STATUSES),
        gte(expenses.spentOn, range.from),
        lte(expenses.spentOn, range.to),
      ),
    )
    .groupBy(expenses.category)
    .orderBy(desc(sql`sum(${expenses.amount})`));

  return { rows, byCategory, summary: { totalExpenses: totalExpenses.toFixed(2) } };
}

export interface ProfitLossRow {
  month: string;
  revenue: string;
  expenses: string;
  profit: string;
}

export interface ProfitLossReport {
  rows: ProfitLossRow[];
  summary: { totalRevenue: string; totalExpenses: string; totalProfit: string };
}

export async function getProfitLossReport(companyId: string, range: DateRange): Promise<ProfitLossReport> {
  const [revenueRows, expenseRows] = await Promise.all([
    queryRevenueByMonth(companyId, range),
    queryExpensesByMonth(companyId, range),
  ]);

  const expenseByMonth = new Map(expenseRows.map((row) => [row.month, row.total]));

  let totalRevenue = new Decimal(0);
  let totalExpenses = new Decimal(0);

  const rows = revenueRows.map((row) => {
    const revenue = new Decimal(row.total);
    const monthExpenses = new Decimal(expenseByMonth.get(row.month) ?? '0');
    const profit = revenue.minus(monthExpenses);

    totalRevenue = totalRevenue.plus(revenue);
    totalExpenses = totalExpenses.plus(monthExpenses);

    return {
      month: row.month,
      revenue: revenue.toFixed(2),
      expenses: monthExpenses.toFixed(2),
      profit: profit.toFixed(2),
    };
  });

  return {
    rows,
    summary: {
      totalRevenue: totalRevenue.toFixed(2),
      totalExpenses: totalExpenses.toFixed(2),
      totalProfit: totalRevenue.minus(totalExpenses).toFixed(2),
    },
  };
}

export interface ProjectProfitabilityRow {
  projectId: string;
  code: string;
  name: string;
  revenue: string;
  expenses: string;
  profit: string;
}

export async function getProjectProfitabilityReport(
  companyId: string,
  range: DateRange,
): Promise<{ rows: ProjectProfitabilityRow[] }> {
  const [revenueByProject, expensesByProject] = await Promise.all([
    db
      .select({ projectId: invoices.projectId, total: sql<string>`coalesce(sum(${invoices.total}), 0)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, companyId),
          isNull(invoices.deletedAt),
          inArray(invoices.status, INVOICE_ISSUED_STATUSES),
          gte(invoices.issueDate, range.from),
          lte(invoices.issueDate, range.to),
          sql`${invoices.projectId} is not null`,
        ),
      )
      .groupBy(invoices.projectId),
    db
      .select({ projectId: expenses.projectId, total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.companyId, companyId),
          isNull(expenses.deletedAt),
          inArray(expenses.status, EXPENSE_REAL_STATUSES),
          gte(expenses.spentOn, range.from),
          lte(expenses.spentOn, range.to),
          sql`${expenses.projectId} is not null`,
        ),
      )
      .groupBy(expenses.projectId),
  ]);

  const revenueMap = new Map(revenueByProject.map((row) => [row.projectId as string, row.total]));
  const expensesMap = new Map(expensesByProject.map((row) => [row.projectId as string, row.total]));

  const projectIds = [...new Set([...revenueMap.keys(), ...expensesMap.keys()])];

  if (projectIds.length === 0) return { rows: [] };

  const projectRows = await db
    .select({ id: projects.id, code: projects.code, name: projects.name })
    .from(projects)
    .where(and(eq(projects.companyId, companyId), inArray(projects.id, projectIds)));

  const rows = projectRows
    .map((project) => {
      const revenue = new Decimal(revenueMap.get(project.id) ?? '0');
      const projectExpenses = new Decimal(expensesMap.get(project.id) ?? '0');

      return {
        projectId: project.id,
        code: project.code,
        name: project.name,
        revenue: revenue.toFixed(2),
        expenses: projectExpenses.toFixed(2),
        profit: revenue.minus(projectExpenses).toFixed(2),
      };
    })
    .sort((a, b) => Number(b.revenue) - Number(a.revenue));

  return { rows };
}

export interface ClientActivityRow {
  clientId: string;
  name: string;
  invoiceCount: number;
  totalInvoiced: string;
  totalPaid: string;
  lastActivityAt: Date | null;
}

/**
 * Per client: invoice volume within the window (any status but `draft` — a
 * cancelled or voided invoice is still a real interaction), plus the
 * *all-time* most recent logged activity, which is not restricted to the
 * window — "when did we last talk to them" should not go blank just because
 * the reporting range is narrow.
 */
export async function getClientActivityReport(
  companyId: string,
  range: DateRange,
): Promise<{ rows: ClientActivityRow[] }> {
  const [invoiceStats, lastActivity, clientRows] = await Promise.all([
    db
      .select({
        clientId: invoices.clientId,
        invoiceCount: sql<number>`count(*)::int`,
        totalInvoiced: sql<string>`coalesce(sum(${invoices.total}), 0)`,
        totalPaid: sql<string>`coalesce(sum(${invoices.amountPaid}), 0)`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, companyId),
          isNull(invoices.deletedAt),
          sql`${invoices.status} != 'draft'`,
          gte(invoices.issueDate, range.from),
          lte(invoices.issueDate, range.to),
        ),
      )
      .groupBy(invoices.clientId),
    db
      .select({ clientId: activities.clientId, lastActivityAt: sql<Date>`max(${activities.occurredAt})` })
      .from(activities)
      .where(
        and(
          eq(activities.companyId, companyId),
          isNull(activities.deletedAt),
          sql`${activities.clientId} is not null`,
        ),
      )
      .groupBy(activities.clientId),
    db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(and(eq(clients.companyId, companyId), isNull(clients.deletedAt)))
      .orderBy(asc(clients.name)),
  ]);

  const invoiceMap = new Map(invoiceStats.map((row) => [row.clientId as string, row]));
  const activityMap = new Map(
    lastActivity.map((row) => [row.clientId as string, parseTimestamptz(row.lastActivityAt)]),
  );

  const rows = clientRows
    .map((client) => {
      const stats = invoiceMap.get(client.id);

      return {
        clientId: client.id,
        name: client.name,
        invoiceCount: stats?.invoiceCount ?? 0,
        totalInvoiced: new Decimal(stats?.totalInvoiced ?? '0').toFixed(2),
        totalPaid: new Decimal(stats?.totalPaid ?? '0').toFixed(2),
        lastActivityAt: activityMap.get(client.id) ?? null,
      };
    })
    .sort((a, b) => Number(b.totalInvoiced) - Number(a.totalInvoiced));

  return { rows };
}

export interface TeamUtilizationRow {
  userId: string;
  name: string;
  loggedHours: string;
  taskCount: number;
  completedTaskCount: number;
}

/**
 * Reads `time_entries` directly rather than `tasks.loggedHours` — that column
 * is the denormalised, single-writer aggregate MEMORY notes stays `'0'` until
 * the deferred time-entries module actually writes it. Reporting from the
 * source rows is correct today regardless of whether that write path exists
 * yet.
 */
export async function getTeamUtilizationReport(
  companyId: string,
  range: DateRange,
): Promise<{ rows: TeamUtilizationRow[] }> {
  const [hoursByUser, taskStats, userRows] = await Promise.all([
    db
      .select({
        userId: timeEntries.userId,
        loggedHours: sql<string>`coalesce(sum(${timeEntries.hours}), 0)`,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.companyId, companyId),
          isNull(timeEntries.deletedAt),
          gte(timeEntries.workedOn, range.from),
          lte(timeEntries.workedOn, range.to),
        ),
      )
      .groupBy(timeEntries.userId),
    db
      .select({
        userId: tasks.assigneeId,
        taskCount: sql<number>`count(*)::int`,
        completedTaskCount: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.companyId, companyId),
          isNull(tasks.deletedAt),
          sql`${tasks.assigneeId} is not null`,
          gte(tasks.createdAt, range.from),
          lte(tasks.createdAt, range.to),
        ),
      )
      .groupBy(tasks.assigneeId),
    db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(and(eq(user.companyId, companyId), eq(user.isActive, true), isNull(user.deletedAt)))
      .orderBy(asc(user.name)),
  ]);

  const hoursMap = new Map(hoursByUser.map((row) => [row.userId as string, row.loggedHours]));
  const taskMap = new Map(taskStats.map((row) => [row.userId as string, row]));

  const rows = userRows
    .map((person) => {
      const tasksForUser = taskMap.get(person.id);

      return {
        userId: person.id,
        name: person.name,
        loggedHours: new Decimal(hoursMap.get(person.id) ?? '0').toFixed(3),
        taskCount: tasksForUser?.taskCount ?? 0,
        completedTaskCount: tasksForUser?.completedTaskCount ?? 0,
      };
    })
    .sort((a, b) => Number(b.loggedHours) - Number(a.loggedHours));

  return { rows };
}

export interface AgingInvoiceRow {
  invoiceId: string;
  number: string;
  clientName: string;
  dueDate: Date;
  daysPastDue: number;
  bucket: AgingBucket;
  outstanding: string;
}

export interface InvoiceAgingReport {
  buckets: { bucket: AgingBucket; count: number; total: string }[];
  invoices: AgingInvoiceRow[];
}

/**
 * A snapshot as of now, not a period report — aging buckets days-past-due
 * against today, so `range` (used by every other report) does not apply here.
 */
export async function getInvoiceAgingReport(companyId: string): Promise<InvoiceAgingReport> {
  const rows = await db
    .select({
      invoiceId: invoices.id,
      number: invoices.number,
      clientName: clients.name,
      dueDate: invoices.dueDate,
      total: invoices.total,
      amountPaid: invoices.amountPaid,
    })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(
      and(
        eq(invoices.companyId, companyId),
        isNull(invoices.deletedAt),
        inArray(invoices.status, INVOICE_OUTSTANDING_STATUSES),
      ),
    )
    .orderBy(asc(invoices.dueDate));

  const now = Date.now();
  const bucketTotals = new Map<AgingBucket, { count: number; total: Decimal }>(
    AGING_BUCKETS.map((bucket) => [bucket, { count: 0, total: new Decimal(0) }]),
  );

  const invoiceRows: AgingInvoiceRow[] = rows.map((row) => {
    const daysPastDue = Math.floor((now - row.dueDate.getTime()) / (24 * 60 * 60 * 1000));
    const bucket = agingBucket(daysPastDue);
    const outstanding = new Decimal(row.total).minus(row.amountPaid);

    const bucketEntry = bucketTotals.get(bucket)!;
    bucketEntry.count += 1;
    bucketEntry.total = bucketEntry.total.plus(outstanding);

    return {
      invoiceId: row.invoiceId,
      number: row.number,
      clientName: row.clientName,
      dueDate: row.dueDate,
      daysPastDue,
      bucket,
      outstanding: outstanding.toFixed(2),
    };
  });

  invoiceRows.sort((a, b) => b.daysPastDue - a.daysPastDue);

  const buckets = AGING_BUCKETS.map((bucket) => {
    const entry = bucketTotals.get(bucket)!;
    return { bucket, count: entry.count, total: entry.total.toFixed(2) };
  });

  return { buckets, invoices: invoiceRows };
}

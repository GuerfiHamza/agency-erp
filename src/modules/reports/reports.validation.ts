import { z } from 'zod';

/**
 * Report type/date-range parsing.
 *
 * Reports are computed on demand from the operational tables (see the schema
 * comment on `savedReports`) — this module has no `create`/`update`/`delete`,
 * matching the permission catalogue's `reports: ['read', 'export']`.
 */

export const REPORT_TYPES = [
  'revenue',
  'expenses',
  'profit_loss',
  'project_profitability',
  'client_activity',
  'team_utilization',
  'invoice_aging',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export function isReportType(value: string | null | undefined): value is ReportType {
  return value != null && (REPORT_TYPES as readonly string[]).includes(value);
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateParam(value: string | null | undefined): Date | null {
  if (!value || !DATE_PATTERN.test(value)) return null;

  const parsed = new Date(`${value}T00:00:00Z`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Resolves the reporting window from `?from=`/`?to=` (`YYYY-MM-DD`).
 *
 * Defaults to the trailing 12 months when a bound is missing or unparsable,
 * and silently swaps a reversed range rather than erroring — the same
 * "normalize, don't 400" posture Calendar's `monthRange` takes toward a bad
 * `?month=`.
 */
export function resolveDateRange(from: string | null | undefined, to: string | null | undefined): DateRange {
  const now = new Date();
  const defaultTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

  let resolvedFrom = parseDateParam(from) ?? defaultFrom;
  let resolvedTo = parseDateParam(to) ?? defaultTo;

  if (resolvedFrom.getTime() > resolvedTo.getTime()) {
    [resolvedFrom, resolvedTo] = [resolvedTo, resolvedFrom];
  }

  return { from: resolvedFrom, to: resolvedTo };
}

export function toDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Every `YYYY-MM` between `from` and `to` inclusive, so a month with no rows still reports zero. */
export function enumerateMonths(from: Date, to: Date): string[] {
  const months: string[] = [];
  let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));

  while (cursor.getTime() <= end.getTime()) {
    months.push(toMonthKey(cursor));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return months;
}

export const AGING_BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'] as const;

export type AgingBucket = (typeof AGING_BUCKETS)[number];

/** Days past due → bucket. Not-yet-due invoices (including due today) land in `current`. */
export function agingBucket(daysPastDue: number): AgingBucket {
  if (daysPastDue <= 0) return 'current';
  if (daysPastDue <= 30) return '1-30';
  if (daysPastDue <= 60) return '31-60';
  if (daysPastDue <= 90) return '61-90';
  return '90+';
}

export const reportQuerySchema = z.object({
  type: z.enum(REPORT_TYPES),
  from: z.string().regex(DATE_PATTERN).nullish(),
  to: z.string().regex(DATE_PATTERN).nullish(),
});

export type ReportQueryInput = z.output<typeof reportQuerySchema>;

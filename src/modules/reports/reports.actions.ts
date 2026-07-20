'use server';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toCsv } from '@/lib/csv';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { err, ok, type Result } from '@/types';

import * as service from './reports.service';
import type { ReportResult } from './reports.service';
import { reportQuerySchema, resolveDateRange } from './reports.validation';

/**
 * Report Server Actions. Each re-establishes the session, re-checks its
 * permission, and re-validates its input, same as every other module.
 */

export async function getReportAction(input: unknown): Promise<Result<ReportResult>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('reports:read');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = reportQuerySchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const range = resolveDateRange(parsed.data.from, parsed.data.to);
    const report = await service.getReport(companyId, parsed.data.type, range);

    return ok(report);
  } catch (error) {
    logger.error('Failed to compute report', { error, companyId, type: parsed.data.type });
    return err(toErrorPayload(error));
  }
}

const dateFormatter = new Intl.DateTimeFormat('en-CA'); // YYYY-MM-DD

function toCsvForReport(report: ReportResult): string {
  switch (report.type) {
    case 'revenue':
      return toCsv(
        ['Month', 'Revenue'],
        report.data.rows.map((row) => [row.month, row.total]),
      );
    case 'expenses':
      return toCsv(
        ['Month', 'Expenses'],
        report.data.rows.map((row) => [row.month, row.total]),
      );
    case 'profit_loss':
      return toCsv(
        ['Month', 'Revenue', 'Expenses', 'Profit'],
        report.data.rows.map((row) => [row.month, row.revenue, row.expenses, row.profit]),
      );
    case 'project_profitability':
      return toCsv(
        ['Project code', 'Project name', 'Revenue', 'Expenses', 'Profit'],
        report.data.rows.map((row) => [row.code, row.name, row.revenue, row.expenses, row.profit]),
      );
    case 'client_activity':
      return toCsv(
        ['Client', 'Invoices', 'Total invoiced', 'Total paid', 'Last activity'],
        report.data.rows.map((row) => [
          row.name,
          row.invoiceCount,
          row.totalInvoiced,
          row.totalPaid,
          row.lastActivityAt ? dateFormatter.format(row.lastActivityAt) : '',
        ]),
      );
    case 'team_utilization':
      return toCsv(
        ['Team member', 'Logged hours', 'Tasks', 'Completed tasks'],
        report.data.rows.map((row) => [row.name, row.loggedHours, row.taskCount, row.completedTaskCount]),
      );
    case 'invoice_aging':
      return toCsv(
        ['Invoice number', 'Client', 'Due date', 'Days past due', 'Bucket', 'Outstanding'],
        report.data.invoices.map((row) => [
          row.number,
          row.clientName,
          dateFormatter.format(row.dueDate),
          row.daysPastDue,
          row.bucket,
          row.outstanding,
        ]),
      );
  }
}

/**
 * Exports the currently viewed report as CSV, using the same type/date-range
 * the page has open — same "download matches what's on screen" posture as
 * Clients' `exportClientsAction`.
 */
export async function exportReportAction(input: unknown): Promise<Result<{ filename: string; csv: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('reports:export');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = reportQuerySchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const range = resolveDateRange(parsed.data.from, parsed.data.to);
    const report = await service.getReport(companyId, parsed.data.type, range);
    const csv = toCsvForReport(report);
    const filename = `report-${parsed.data.type}-${dateFormatter.format(new Date())}.csv`;

    return ok({ filename, csv });
  } catch (error) {
    logger.error('Failed to export report', { error, companyId, type: parsed.data.type });
    return err(toErrorPayload(error));
  }
}

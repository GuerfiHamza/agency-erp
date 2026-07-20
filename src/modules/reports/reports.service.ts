import 'server-only';

import * as repository from './reports.repository';
import type { DateRange, ReportType } from './reports.validation';

export type {
  AgingInvoiceRow,
  CategoryAmount,
  ClientActivityRow,
  InvoiceAgingReport,
  MonthAmount,
  ProfitLossReport,
  ProfitLossRow,
  ProjectProfitabilityRow,
  RevenueReport,
  TeamUtilizationRow,
} from './reports.repository';

/**
 * Reports have no create/update/delete — the permission catalogue only
 * defines `reports:read`/`reports:export`, because a report is computed from
 * the operational tables on every read (see the `saved_reports` schema
 * comment), never stored.
 */

export type ReportResult =
  | { type: 'revenue'; data: repository.RevenueReport }
  | { type: 'expenses'; data: repository.ExpensesReport }
  | { type: 'profit_loss'; data: repository.ProfitLossReport }
  | { type: 'project_profitability'; data: { rows: repository.ProjectProfitabilityRow[] } }
  | { type: 'client_activity'; data: { rows: repository.ClientActivityRow[] } }
  | { type: 'team_utilization'; data: { rows: repository.TeamUtilizationRow[] } }
  | { type: 'invoice_aging'; data: repository.InvoiceAgingReport };

export async function getReport(
  companyId: string,
  type: ReportType,
  range: DateRange,
): Promise<ReportResult> {
  switch (type) {
    case 'revenue':
      return { type, data: await repository.getRevenueReport(companyId, range) };
    case 'expenses':
      return { type, data: await repository.getExpensesReport(companyId, range) };
    case 'profit_loss':
      return { type, data: await repository.getProfitLossReport(companyId, range) };
    case 'project_profitability':
      return { type, data: await repository.getProjectProfitabilityReport(companyId, range) };
    case 'client_activity':
      return { type, data: await repository.getClientActivityReport(companyId, range) };
    case 'team_utilization':
      return { type, data: await repository.getTeamUtilizationReport(companyId, range) };
    case 'invoice_aging':
      return { type, data: await repository.getInvoiceAgingReport(companyId) };
  }
}

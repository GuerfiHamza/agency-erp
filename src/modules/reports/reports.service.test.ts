import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import {
  activities,
  clients,
  companies,
  expenses,
  invoices,
  projects,
  tasks,
  timeEntries,
  user,
} from '@/db/schema';

import * as service from './reports.service';
import { resolveDateRange } from './reports.validation';

/**
 * Against the real Postgres. Pins each of the seven report aggregations —
 * revenue, expenses, profit_loss, project_profitability, client_activity,
 * team_utilization, invoice_aging — including the "combine two independently
 * aggregated numeric strings with decimal.js" rule in profit_loss and
 * project_profitability, and the tenant scoping every query applies.
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG_A = 'vitest-reports-a';
const SLUG_B = 'vitest-reports-b';

async function cleanupCompany(slug: string) {
  const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.slug, slug));

  if (company) {
    await db.delete(invoices).where(eq(invoices.companyId, company.id));
    await db.delete(expenses).where(eq(expenses.companyId, company.id));
    await db.delete(timeEntries).where(eq(timeEntries.companyId, company.id));
    await db.delete(tasks).where(eq(tasks.companyId, company.id));
    await db.delete(activities).where(eq(activities.companyId, company.id));
    await db.delete(projects).where(eq(projects.companyId, company.id));
    await db.delete(clients).where(eq(clients.companyId, company.id));
    await db.delete(user).where(eq(user.companyId, company.id));
  }

  await db.delete(companies).where(eq(companies.slug, slug));
}

async function cleanup() {
  await cleanupCompany(SLUG_A);
  await cleanupCompany(SLUG_B);
}

beforeEach(cleanup);
afterAll(cleanup);

const RANGE = resolveDateRange('2026-04-01', '2026-06-30');

async function fixture(slug: string) {
  const [company] = await db.insert(companies).values({ name: 'Vitest Co', slug }).returning();
  if (!company) throw new Error('fixture company failed');

  const [client] = await db.insert(clients).values({ companyId: company.id, name: 'Acme Corp' }).returning();
  const [project] = await db
    .insert(projects)
    .values({ companyId: company.id, name: 'Website', code: `PRJ-${slug}-1` })
    .returning();
  const [employee] = await db
    .insert(user)
    .values({
      name: 'Alice',
      email: `vitest-reports-alice-${slug}@nexus.test`,
      emailVerified: true,
      companyId: company.id,
    })
    .returning();

  if (!client || !project || !employee) throw new Error('fixture failed');

  return { company, client, project, employee };
}

describe('getRevenueReport', () => {
  it('sums issued invoices by month and excludes drafts', async () => {
    const f = await fixture(SLUG_A);

    await db.insert(invoices).values([
      {
        companyId: f.company.id,
        clientId: f.client.id,
        number: 'INV-A-1',
        status: 'sent',
        issueDate: new Date('2026-05-10T00:00:00Z'),
        dueDate: new Date('2026-06-09T00:00:00Z'),
        currency: 'DZD',
        total: '1000.00',
      },
      {
        companyId: f.company.id,
        clientId: f.client.id,
        number: 'INV-A-2',
        status: 'draft',
        issueDate: new Date('2026-05-15T00:00:00Z'),
        dueDate: new Date('2026-06-14T00:00:00Z'),
        currency: 'DZD',
        total: '9999.00',
      },
    ]);

    const report = await service.getReport(f.company.id, 'revenue', RANGE);

    if (report.type !== 'revenue') throw new Error('wrong report type');
    expect(report.data.summary.totalRevenue).toBe('1000.00');

    const may = report.data.rows.find((row) => row.month === '2026-05');
    expect(may?.total).toBe('1000.00');
  });

  it('zero-fills months with no invoices and scopes by company', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await db.insert(invoices).values({
      companyId: b.company.id,
      clientId: b.client.id,
      number: 'INV-B-1',
      status: 'paid',
      issueDate: new Date('2026-05-01T00:00:00Z'),
      dueDate: new Date('2026-05-31T00:00:00Z'),
      currency: 'DZD',
      total: '5000.00',
      amountPaid: '5000.00',
    });

    const report = await service.getReport(a.company.id, 'revenue', RANGE);

    if (report.type !== 'revenue') throw new Error('wrong report type');
    expect(report.data.rows).toHaveLength(3);
    expect(report.data.summary.totalRevenue).toBe('0.00');
  });
});

describe('getExpensesReport', () => {
  it('sums real (non-draft) expenses by month and by category', async () => {
    const f = await fixture(SLUG_A);

    await db.insert(expenses).values([
      {
        companyId: f.company.id,
        description: 'Flights',
        category: 'travel',
        status: 'approved',
        amount: '300.00',
        currency: 'DZD',
        spentOn: new Date('2026-05-05T00:00:00Z'),
      },
      {
        companyId: f.company.id,
        description: 'Not yet submitted',
        category: 'software',
        status: 'draft',
        amount: '9999.00',
        currency: 'DZD',
        spentOn: new Date('2026-05-06T00:00:00Z'),
      },
    ]);

    const report = await service.getReport(f.company.id, 'expenses', RANGE);

    if (report.type !== 'expenses') throw new Error('wrong report type');
    expect(report.data.summary.totalExpenses).toBe('300.00');
    expect(report.data.byCategory).toEqual([{ category: 'travel', total: '300.00' }]);
  });
});

describe('getProfitLossReport', () => {
  it('derives profit per month from independently summed revenue and expenses', async () => {
    const f = await fixture(SLUG_A);

    await db.insert(invoices).values({
      companyId: f.company.id,
      clientId: f.client.id,
      number: 'INV-PL-1',
      status: 'sent',
      issueDate: new Date('2026-05-10T00:00:00Z'),
      dueDate: new Date('2026-06-09T00:00:00Z'),
      currency: 'DZD',
      total: '1000.00',
    });
    await db.insert(expenses).values({
      companyId: f.company.id,
      description: 'Flights',
      category: 'travel',
      status: 'approved',
      amount: '300.00',
      currency: 'DZD',
      spentOn: new Date('2026-05-06T00:00:00Z'),
    });

    const report = await service.getReport(f.company.id, 'profit_loss', RANGE);

    if (report.type !== 'profit_loss') throw new Error('wrong report type');
    const may = report.data.rows.find((row) => row.month === '2026-05');
    expect(may).toEqual({ month: '2026-05', revenue: '1000.00', expenses: '300.00', profit: '700.00' });
    expect(report.data.summary.totalProfit).toBe('700.00');
  });
});

describe('getProjectProfitabilityReport', () => {
  it('nets revenue and expenses per project', async () => {
    const f = await fixture(SLUG_A);

    await db.insert(invoices).values({
      companyId: f.company.id,
      clientId: f.client.id,
      projectId: f.project.id,
      number: 'INV-PP-1',
      status: 'sent',
      issueDate: new Date('2026-05-10T00:00:00Z'),
      dueDate: new Date('2026-06-09T00:00:00Z'),
      currency: 'DZD',
      total: '2000.00',
    });
    await db.insert(expenses).values({
      companyId: f.company.id,
      projectId: f.project.id,
      description: 'Contractor',
      category: 'subcontractor',
      status: 'reimbursed',
      amount: '500.00',
      currency: 'DZD',
      spentOn: new Date('2026-05-12T00:00:00Z'),
    });

    const report = await service.getReport(f.company.id, 'project_profitability', RANGE);

    if (report.type !== 'project_profitability') throw new Error('wrong report type');
    expect(report.data.rows).toEqual([
      {
        projectId: f.project.id,
        code: f.project.code,
        name: 'Website',
        revenue: '2000.00',
        expenses: '500.00',
        profit: '1500.00',
      },
    ]);
  });

  it('omits projects with no revenue or expenses in the range', async () => {
    const f = await fixture(SLUG_A);

    const report = await service.getReport(f.company.id, 'project_profitability', RANGE);

    if (report.type !== 'project_profitability') throw new Error('wrong report type');
    expect(report.data.rows).toEqual([]);
  });
});

describe('getClientActivityReport', () => {
  it('reports invoice volume in range and the all-time most recent activity', async () => {
    const f = await fixture(SLUG_A);

    await db.insert(invoices).values({
      companyId: f.company.id,
      clientId: f.client.id,
      number: 'INV-CA-1',
      status: 'sent',
      issueDate: new Date('2026-05-01T00:00:00Z'),
      dueDate: new Date('2026-05-31T00:00:00Z'),
      currency: 'DZD',
      total: '400.00',
      amountPaid: '100.00',
    });
    // Outside the reporting window, but should still surface as "last activity".
    await db.insert(activities).values({
      companyId: f.company.id,
      clientId: f.client.id,
      type: 'call',
      subject: 'Kickoff call',
      occurredAt: new Date('2025-01-01T00:00:00Z'),
    });

    const report = await service.getReport(f.company.id, 'client_activity', RANGE);

    if (report.type !== 'client_activity') throw new Error('wrong report type');
    expect(report.data.rows).toEqual([
      {
        clientId: f.client.id,
        name: 'Acme Corp',
        invoiceCount: 1,
        totalInvoiced: '400.00',
        totalPaid: '100.00',
        lastActivityAt: new Date('2025-01-01T00:00:00Z'),
      },
    ]);
  });

  it('lists a client with zero invoices in range at zero, not omitted', async () => {
    const f = await fixture(SLUG_A);

    const report = await service.getReport(f.company.id, 'client_activity', RANGE);

    if (report.type !== 'client_activity') throw new Error('wrong report type');
    expect(report.data.rows).toEqual([
      {
        clientId: f.client.id,
        name: 'Acme Corp',
        invoiceCount: 0,
        totalInvoiced: '0.00',
        totalPaid: '0.00',
        lastActivityAt: null,
      },
    ]);
  });
});

describe('getTeamUtilizationReport', () => {
  it('sums time_entries directly rather than the denormalised tasks.loggedHours', async () => {
    const f = await fixture(SLUG_A);

    await db.insert(timeEntries).values({
      companyId: f.company.id,
      projectId: f.project.id,
      userId: f.employee.id,
      hours: '6.5',
      workedOn: new Date('2026-05-10T00:00:00Z'),
    });
    await db.insert(tasks).values([
      {
        companyId: f.company.id,
        projectId: f.project.id,
        assigneeId: f.employee.id,
        title: 'Build homepage',
        status: 'done',
        createdAt: new Date('2026-05-01T00:00:00Z'),
      },
      {
        companyId: f.company.id,
        projectId: f.project.id,
        assigneeId: f.employee.id,
        title: 'Build footer',
        status: 'todo',
        createdAt: new Date('2026-05-02T00:00:00Z'),
      },
    ]);

    const report = await service.getReport(f.company.id, 'team_utilization', RANGE);

    if (report.type !== 'team_utilization') throw new Error('wrong report type');
    expect(report.data.rows).toEqual([
      {
        userId: f.employee.id,
        name: 'Alice',
        loggedHours: '6.500',
        taskCount: 2,
        completedTaskCount: 1,
      },
    ]);
  });
});

describe('getInvoiceAgingReport', () => {
  it('buckets outstanding invoices by days past due and excludes settled ones', async () => {
    const f = await fixture(SLUG_A);
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();

    await db.insert(invoices).values([
      {
        companyId: f.company.id,
        clientId: f.client.id,
        number: 'INV-AGE-1',
        status: 'sent',
        issueDate: new Date(now - 100 * DAY),
        dueDate: new Date(now - 45 * DAY),
        currency: 'DZD',
        total: '1000.00',
        amountPaid: '400.00',
      },
      {
        companyId: f.company.id,
        clientId: f.client.id,
        number: 'INV-AGE-2',
        status: 'paid',
        issueDate: new Date(now - 100 * DAY),
        dueDate: new Date(now - 45 * DAY),
        currency: 'DZD',
        total: '1000.00',
        amountPaid: '1000.00',
      },
    ]);

    const report = await service.getReport(f.company.id, 'invoice_aging', RANGE);

    if (report.type !== 'invoice_aging') throw new Error('wrong report type');
    expect(report.data.invoices).toHaveLength(1);
    expect(report.data.invoices[0]).toMatchObject({
      number: 'INV-AGE-1',
      bucket: '31-60',
      outstanding: '600.00',
    });

    const bucket3160 = report.data.buckets.find((b) => b.bucket === '31-60');
    expect(bucket3160).toEqual({ bucket: '31-60', count: 1, total: '600.00' });

    const current = report.data.buckets.find((b) => b.bucket === 'current');
    expect(current).toEqual({ bucket: 'current', count: 0, total: '0.00' });
  });
});

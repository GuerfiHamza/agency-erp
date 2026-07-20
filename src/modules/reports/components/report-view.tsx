'use client';

import { Download } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { exportReportAction } from '../reports.actions';
import type { ReportResult } from '../reports.service';
import type { AgingBucket } from '../reports.validation';

interface Props {
  report: ReportResult;
  from: string;
  to: string;
  canExport: boolean;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function Summary({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="space-y-1">
            <CardDescription>{item.label}</CardDescription>
            <CardTitle className="text-2xl">{item.value}</CardTitle>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const BUCKET_VARIANT: Record<AgingBucket, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  current: 'secondary',
  '1-30': 'outline',
  '31-60': 'outline',
  '61-90': 'destructive',
  '90+': 'destructive',
};

/**
 * Renders one of the seven report shapes. A `switch` on `report.type` rather
 * than seven components in seven files: each is a handful of rows, and the
 * shared summary-tile/table chrome is more valuable kept in one place than
 * split for its own sake.
 */
export function ReportView({ report, from, to, canExport }: Props) {
  const [isExporting, startExport] = useTransition();

  function onExport() {
    startExport(async () => {
      const result = await exportReportAction({ type: report.type, from, to });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.data.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  }

  const exportButton = canExport && (
    <div className="flex justify-end">
      <Button variant="outline" size="sm" onClick={onExport} disabled={isExporting}>
        <Download aria-hidden />
        {isExporting ? 'Exporting…' : 'Export CSV'}
      </Button>
    </div>
  );

  switch (report.type) {
    case 'revenue':
      return (
        <div className="space-y-4">
          {exportButton}
          <Summary items={[{ label: 'Total revenue', value: report.data.summary.totalRevenue }]} />
          <MonthTable rows={report.data.rows} valueLabel="Revenue" />
        </div>
      );

    case 'expenses':
      return (
        <div className="space-y-4">
          {exportButton}
          <Summary items={[{ label: 'Total expenses', value: report.data.summary.totalExpenses }]} />
          <MonthTable rows={report.data.rows} valueLabel="Expenses" />
          {report.data.byCategory.length > 0 && (
            <div className="rounded-lg border border-border glass">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.data.byCategory.map((row) => (
                    <TableRow key={row.category}>
                      <TableCell className="capitalize">{row.category}</TableCell>
                      <TableCell className="text-right font-mono">{row.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      );

    case 'profit_loss':
      return (
        <div className="space-y-4">
          {exportButton}
          <Summary
            items={[
              { label: 'Revenue', value: report.data.summary.totalRevenue },
              { label: 'Expenses', value: report.data.summary.totalExpenses },
              { label: 'Profit', value: report.data.summary.totalProfit },
            ]}
          />
          <div className="rounded-lg border border-border glass">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.data.rows.map((row) => (
                  <TableRow key={row.month}>
                    <TableCell>{row.month}</TableCell>
                    <TableCell className="text-right font-mono">{row.revenue}</TableCell>
                    <TableCell className="text-right font-mono">{row.expenses}</TableCell>
                    <TableCell className="text-right font-mono">{row.profit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      );

    case 'project_profitability':
      return (
        <div className="space-y-4">
          {exportButton}
          {report.data.rows.length === 0 ? (
            <EmptyState title="No project activity in this range" />
          ) : (
            <div className="rounded-lg border border-border glass">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.data.rows.map((row) => (
                    <TableRow key={row.projectId}>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">{row.code}</span> {row.name}
                      </TableCell>
                      <TableCell className="text-right font-mono">{row.revenue}</TableCell>
                      <TableCell className="text-right font-mono">{row.expenses}</TableCell>
                      <TableCell className="text-right font-mono">{row.profit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      );

    case 'client_activity':
      return (
        <div className="space-y-4">
          {exportButton}
          {report.data.rows.length === 0 ? (
            <EmptyState title="No clients yet" />
          ) : (
            <div className="rounded-lg border border-border glass">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                    <TableHead className="text-right">Invoiced</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead>Last activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.data.rows.map((row) => (
                    <TableRow key={row.clientId}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-right">{row.invoiceCount}</TableCell>
                      <TableCell className="text-right font-mono">{row.totalInvoiced}</TableCell>
                      <TableCell className="text-right font-mono">{row.totalPaid}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.lastActivityAt ? dateFormatter.format(new Date(row.lastActivityAt)) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      );

    case 'team_utilization':
      return (
        <div className="space-y-4">
          {exportButton}
          {report.data.rows.length === 0 ? (
            <EmptyState title="No team members yet" />
          ) : (
            <div className="rounded-lg border border-border glass">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team member</TableHead>
                    <TableHead className="text-right">Logged hours</TableHead>
                    <TableHead className="text-right">Tasks</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.data.rows.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-right font-mono">{row.loggedHours}</TableCell>
                      <TableCell className="text-right">{row.taskCount}</TableCell>
                      <TableCell className="text-right">{row.completedTaskCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      );

    case 'invoice_aging':
      return (
        <div className="space-y-4">
          {exportButton}
          <div className="grid gap-4 sm:grid-cols-5">
            {report.data.buckets.map((bucket) => (
              <Card key={bucket.bucket}>
                <CardContent className="space-y-1">
                  <Badge variant={BUCKET_VARIANT[bucket.bucket]}>{bucket.bucket}</Badge>
                  <CardTitle className="text-xl">{bucket.total}</CardTitle>
                  <CardDescription>
                    {bucket.count} invoice{bucket.count === 1 ? '' : 's'}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
          {report.data.invoices.length === 0 ? (
            <EmptyState title="No outstanding invoices" description="Everything issued has been settled." />
          ) : (
            <div className="rounded-lg border border-border glass">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead className="text-right">Days past due</TableHead>
                    <TableHead>Bucket</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.data.invoices.map((row) => (
                    <TableRow key={row.invoiceId}>
                      <TableCell className="font-mono text-xs">{row.number}</TableCell>
                      <TableCell>{row.clientName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {dateFormatter.format(new Date(row.dueDate))}
                      </TableCell>
                      <TableCell className="text-right">{row.daysPastDue}</TableCell>
                      <TableCell>
                        <Badge variant={BUCKET_VARIANT[row.bucket]}>{row.bucket}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{row.outstanding}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      );
  }
}

function MonthTable({ rows, valueLabel }: { rows: { month: string; total: string }[]; valueLabel: string }) {
  if (rows.every((row) => Number(row.total) === 0)) {
    return <EmptyState title="No activity in this range" />;
  }

  return (
    <div className="rounded-lg border border-border glass">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Month</TableHead>
            <TableHead className="text-right">{valueLabel}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.month}>
              <TableCell>{row.month}</TableCell>
              <TableCell className="text-right font-mono">{row.total}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

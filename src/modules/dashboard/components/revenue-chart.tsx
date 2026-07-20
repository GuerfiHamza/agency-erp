'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

import type { MonthAmount } from '@/modules/reports/reports.service';

interface Props {
  rows: MonthAmount[];
  currency: string;
}

const monthLabelFormatter = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { month: 'short' }).format(
    new Date(Date.UTC(year ?? 0, (monthNumber ?? 1) - 1, 1)),
  );
};

/**
 * A single series (this company's monthly revenue), so no legend — the
 * "Revenue" title already names it. Uses the app's own `--primary` token
 * rather than the dataviz skill's default categorical palette: this project
 * already has an established design-token system (see MEMORY's "Design"
 * section), and a single-series magnitude chart draws from it directly.
 */
export function RevenueChart({ rows, currency }: Props) {
  const data = rows.map((row) => ({ month: row.month, total: Number(row.total) }));

  const currencyFormatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickFormatter={monthLabelFormatter}
          tickLine={false}
          axisLine={false}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
        />
        <Tooltip
          formatter={(value) => currencyFormatter.format(Number(value))}
          labelFormatter={(label) => monthLabelFormatter(String(label))}
          contentStyle={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
        />
        <Area
          type="monotone"
          dataKey="total"
          stroke="var(--primary)"
          strokeWidth={2}
          fill="url(#revenueFill)"
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

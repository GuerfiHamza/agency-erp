import Decimal from 'decimal.js';

/**
 * Exact decimal math for commercial documents (quotes, proforma invoices,
 * invoices, purchase orders). All inputs/outputs are canonical decimal
 * strings matching `numeric` columns — never floats.
 *
 * Each line is rounded to money precision (2dp) before it is summed, so
 * `total === subtotal - discountTotal + taxTotal` holds exactly instead of
 * drifting from rounding the aggregate separately.
 */

export interface LineInput {
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxRate: string;
}

export interface LineTotals {
  lineSubtotal: string;
  discountAmount: string;
  taxAmount: string;
  lineTotal: string;
}

export interface DocumentTotals {
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
}

function money2dp(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export function computeLineTotals(line: LineInput): LineTotals {
  const lineSubtotal = new Decimal(line.quantity).times(line.unitPrice);
  const discountAmount = lineSubtotal.times(line.discountPercent).div(100);
  const afterDiscount = lineSubtotal.minus(discountAmount);
  const taxAmount = afterDiscount.times(line.taxRate).div(100);
  const lineTotal = afterDiscount.plus(taxAmount);

  return {
    lineSubtotal: money2dp(lineSubtotal),
    discountAmount: money2dp(discountAmount),
    taxAmount: money2dp(taxAmount),
    lineTotal: money2dp(lineTotal),
  };
}

export function computeDocumentTotals(lines: LineInput[]): DocumentTotals {
  let subtotal = new Decimal(0);
  let discountTotal = new Decimal(0);
  let taxTotal = new Decimal(0);
  let total = new Decimal(0);

  for (const line of lines) {
    const computed = computeLineTotals(line);
    subtotal = subtotal.plus(computed.lineSubtotal);
    discountTotal = discountTotal.plus(computed.discountAmount);
    taxTotal = taxTotal.plus(computed.taxAmount);
    total = total.plus(computed.lineTotal);
  }

  return {
    subtotal: money2dp(subtotal),
    discountTotal: money2dp(discountTotal),
    taxTotal: money2dp(taxTotal),
    total: money2dp(total),
  };
}

import { describe, expect, it } from 'vitest';

import { computeDocumentTotals, computeLineTotals } from './money';

describe('computeLineTotals', () => {
  it('applies discount before tax and rounds to 2dp', () => {
    const result = computeLineTotals({
      quantity: '2',
      unitPrice: '10.00',
      discountPercent: '10',
      taxRate: '20',
    });

    expect(result.lineSubtotal).toBe('20.00');
    expect(result.discountAmount).toBe('2.00');
    expect(result.taxAmount).toBe('3.60');
    expect(result.lineTotal).toBe('21.60');
  });

  it('never drifts through a float on a repeating decimal quantity', () => {
    const result = computeLineTotals({
      quantity: '0.1',
      unitPrice: '0.1',
      discountPercent: '0',
      taxRate: '0',
    });

    // 0.1 * 0.1 = 0.01 exactly in decimal math; a naive float (0.1*0.1) also
    // happens to print 0.01, so this pins the decimal path, not a fluke.
    expect(result.lineTotal).toBe('0.01');
  });
});

describe('computeDocumentTotals', () => {
  it('sums lines so total equals subtotal minus discount plus tax exactly', () => {
    const totals = computeDocumentTotals([
      { quantity: '2', unitPrice: '10.00', discountPercent: '10', taxRate: '20' },
      { quantity: '1', unitPrice: '5.50', discountPercent: '0', taxRate: '10' },
    ]);

    expect(totals.subtotal).toBe('25.50');
    expect(totals.discountTotal).toBe('2.00');
    expect(totals.taxTotal).toBe('4.15');
    expect(totals.total).toBe('27.65');

    const bySubtraction = (
      Number(totals.subtotal) -
      Number(totals.discountTotal) +
      Number(totals.taxTotal)
    ).toFixed(2);
    expect(totals.total).toBe(bySubtraction);
  });

  it('returns zeroes for no lines', () => {
    const totals = computeDocumentTotals([]);
    expect(totals).toEqual({ subtotal: '0.00', discountTotal: '0.00', taxTotal: '0.00', total: '0.00' });
  });
});

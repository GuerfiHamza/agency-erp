import { describe, expect, it } from 'vitest';

import { agingBucket, enumerateMonths, resolveDateRange, toDateParam } from './reports.validation';

describe('resolveDateRange', () => {
  it('defaults to the trailing 12 months when both bounds are missing', () => {
    const range = resolveDateRange(null, null);
    const months = enumerateMonths(range.from, range.to);

    expect(months).toHaveLength(12);
  });

  it('parses explicit YYYY-MM-DD bounds', () => {
    const range = resolveDateRange('2026-01-01', '2026-03-31');

    expect(toDateParam(range.from)).toBe('2026-01-01');
    expect(toDateParam(range.to)).toBe('2026-03-31');
  });

  it('swaps a reversed range rather than erroring', () => {
    const range = resolveDateRange('2026-06-01', '2026-01-01');

    expect(toDateParam(range.from)).toBe('2026-01-01');
    expect(toDateParam(range.to)).toBe('2026-06-01');
  });

  it('falls back to the default for an unparsable bound', () => {
    const range = resolveDateRange('not-a-date', '2026-03-31');

    expect(toDateParam(range.to)).toBe('2026-03-31');
    expect(range.from.getTime()).toBeLessThan(range.to.getTime());
  });
});

describe('enumerateMonths', () => {
  it('includes both endpoints and fills every month between', () => {
    const months = enumerateMonths(new Date('2026-01-15T00:00:00Z'), new Date('2026-04-02T00:00:00Z'));

    expect(months).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
  });

  it('returns a single month when from and to are in the same month', () => {
    const months = enumerateMonths(new Date('2026-05-01T00:00:00Z'), new Date('2026-05-31T00:00:00Z'));

    expect(months).toEqual(['2026-05']);
  });
});

describe('agingBucket', () => {
  it('buckets not-yet-due and due-today invoices as current', () => {
    expect(agingBucket(-5)).toBe('current');
    expect(agingBucket(0)).toBe('current');
  });

  it('buckets by days past due at each boundary', () => {
    expect(agingBucket(1)).toBe('1-30');
    expect(agingBucket(30)).toBe('1-30');
    expect(agingBucket(31)).toBe('31-60');
    expect(agingBucket(60)).toBe('31-60');
    expect(agingBucket(61)).toBe('61-90');
    expect(agingBucket(90)).toBe('61-90');
    expect(agingBucket(91)).toBe('90+');
  });
});

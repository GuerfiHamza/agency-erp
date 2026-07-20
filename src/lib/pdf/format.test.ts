import { describe, expect, it } from 'vitest';

import { formatMoney } from './format';

describe('formatMoney', () => {
  it('groups thousands with a plain space, never a narrow no-break space', () => {
    // `Intl` groups fr-FR numbers with U+202F, which Helvetica's
    // WinAnsiEncoding has no glyph for — pdfkit silently mis-encoded it to
    // "/", printing "50 000" as "50/000". Pinned here so it can't regress.
    expect(formatMoney('50000', 'DZD', 'fr-FR')).toBe('50 000,00');
    expect(formatMoney('50000', 'DZD', 'fr-FR')).not.toContain('/');
    expect(formatMoney('1200000', 'DZD', 'fr-FR')).toBe('1 200 000,00');
  });

  it('never prints a currency code or symbol', () => {
    expect(formatMoney('50000', 'DZD', 'fr-FR')).not.toContain('DZD');
    expect(formatMoney('50000', 'EUR', 'fr-FR')).not.toContain('€');
    expect(formatMoney('50000', 'USD', 'en-US')).not.toContain('$');
  });

  it('keeps two decimal places for a fractional amount', () => {
    expect(formatMoney('35745.5', 'DZD', 'fr-FR')).toBe('35 745,50');
  });

  it('falls back to the raw value with the currency code for a malformed amount', () => {
    expect(formatMoney('not-a-number', 'DZD', 'fr-FR')).toBe('not-a-number DZD');
  });
});

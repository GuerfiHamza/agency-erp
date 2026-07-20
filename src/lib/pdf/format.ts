/**
 * Formatting for printed documents.
 *
 * Lives beside the PDF code rather than in a UI helper because the rules differ:
 * a document is a record, so it always shows its own currency and an unambiguous
 * date, regardless of who is looking at it or where they are.
 */

/**
 * Format a money amount as a plain grouped decimal — no currency code or
 * symbol. The document's own currency is already stated once (the header,
 * the totals section), so repeating "DZD" on every line/cell is noise, not
 * clarity.
 *
 * Takes a **string**, because that is what Drizzle returns for `numeric` and the
 * whole point of that choice is never to route the value through a float. The
 * string is handed to `Intl` untouched.
 */
export function formatMoney(amount: string | number, currency: string, locale = 'en-US'): string {
  const value = typeof amount === 'number' ? amount : Number(amount);

  // Only reachable on a malformed row; showing the raw value beats printing
  // "NaN" on an invoice a client will read.
  if (!Number.isFinite(value)) return `${amount} ${currency}`;

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

  // `Intl` groups French numbers with a NARROW no-break space (U+202F), which
  // Helvetica's WinAnsiEncoding has no glyph for — pdfkit silently mis-encodes
  // it down to its low byte, which happens to be "/" (50 000 prints as
  // "50/000"). A plain space renders correctly and reads just as well on a
  // printed page. The ordinary no-break space (U+00A0, used elsewhere by
  // `Intl`, e.g. before a currency code) is technically safe in
  // WinAnsiEncoding, but normalising both here is one rule instead of two.
  return formatted.replace(/[  ]/g, ' ');
}

/**
 * Format a date for print.
 *
 * Defaults to a spelled-out month: `03/04/2026` means March 4th to an American
 * and April 3rd to everyone else, and an invoice due date is not a good place
 * for that ambiguity.
 */
export function formatDocumentDate(date: Date | string, locale = 'en-US'): string {
  const value = typeof date === 'string' ? new Date(date) : date;

  if (Number.isNaN(value.getTime())) return '—';

  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(value);
}

/** Percentages as stored: 0–100, not a fraction. */
export function formatPercent(value: string | number): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '—';

  // Trailing zeros dropped: "20%" not "20.00%".
  return `${numeric % 1 === 0 ? numeric.toFixed(0) : numeric.toFixed(2)}%`;
}

/** Quantities, trimmed of noise decimals. */
export function formatQuantity(value: string | number): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);

  return numeric % 1 === 0 ? numeric.toFixed(0) : String(numeric);
}

/**
 * Minimal RFC 4180 CSV writer.
 *
 * A field is quoted only when it must be — it contains a comma, a quote, or a
 * newline — and an embedded quote is doubled. That is the whole spec that
 * matters for export; a dependency for this would be four lines wearing a
 * package.json.
 */

function escapeField(value: unknown): string {
  if (value === null || value === undefined) return '';

  const text = value instanceof Date ? value.toISOString() : String(value);

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Build a CSV string from a header row and data rows, in column order. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  // \r\n line endings: the standard, and what Excel expects on every platform.
  return [headers, ...rows].map((row) => row.map(escapeField).join(',')).join('\r\n');
}

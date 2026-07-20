import { StyleSheet } from '@react-pdf/renderer';

/**
 * Shared PDF styling.
 *
 * A separate stylesheet from the app's, and necessarily so: `@react-pdf/renderer`
 * implements a small subset of CSS with its own layout engine. Tailwind classes,
 * CSS custom properties, and `oklch()` mean nothing here, so the palette is
 * restated as plain values rather than imported from the design tokens.
 *
 * The values are the *print* interpretation of the brand: documents are read on
 * white paper, so the dark UI palette is inverted rather than reused. A quote
 * printed in #09090B is a quote nobody prints twice.
 */

export const PDF_COLORS = {
  text: '#12131a',
  muted: '#5f6270',
  border: '#e1e2ea',
  /** The one token shared with the UI — the brand accent. */
  primary: '#FF6A00',
  headerBackground: '#f2f3f7',
} as const;

export const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontSize: 9,
    color: PDF_COLORS.text,
    // Helvetica is one of the 14 fonts built into the PDF format, so it needs
    // no embedding and renders identically everywhere. Registering Inter would
    // mean shipping and embedding the font file.
    fontFamily: 'Helvetica',
    lineHeight: 1.5,
  },

  // Logo (left) + date/reference (right), both on one row above the info box —
  // the layout this template mirrors puts the company name inside the info
  // box below, not up here, so this row is deliberately sparse.
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  logo: { maxWidth: 140, maxHeight: 50, objectFit: 'contain' },
  headerRight: { alignItems: 'flex-end' },
  headerRightLine: { fontSize: 9, color: PDF_COLORS.text, marginBottom: 3 },

  // Large text needs its own lineHeight. Inheriting the page's 1.5 leaves a line
  // box shorter than the glyphs at 15–20pt, so the heading collides with the
  // line beneath it.
  companyName: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: PDF_COLORS.text,
    lineHeight: 1.3,
    marginBottom: 3,
  },
  documentTitleCentered: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: PDF_COLORS.primary,
    textAlign: 'center',
    lineHeight: 1.3,
    marginTop: 18,
    marginBottom: 4,
  },
  // Plain, unboxed line under the title for whatever module-specific fields
  // the fixed mockup this is based on had no slot for (due date, validity,
  // status...) — read as a caption, not a second table.
  metaLine: {
    fontSize: 8.5,
    color: PDF_COLORS.muted,
    textAlign: 'center',
    marginBottom: 18,
  },
  metaLineValue: { fontFamily: 'Helvetica-Bold', color: PDF_COLORS.text },

  // The two-party block: soft tinted panels, not a ruled box — a light gap
  // between them does the separating instead of a drawn line.
  infoBox: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  infoBoxColumn: {
    flex: 1,
    backgroundColor: PDF_COLORS.headerBackground,
    borderRadius: 4,
    padding: 10,
  },

  metaBlock: { maxWidth: '48%' },
  label: {
    fontSize: 7,
    color: PDF_COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  strong: { fontFamily: 'Helvetica-Bold' },

  // The line-item table reads by alternating a hint of background rather
  // than ruling every cell — no vertical lines at all, one thin rule
  // between rows.
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderBottomWidth: 1.5,
    borderBottomColor: PDF_COLORS.text,
  },
  tableHeaderLabel: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: PDF_COLORS.muted,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF_COLORS.border,
  },
  tableRowAlt: { backgroundColor: '#fafafb' },
  // Money and quantities are right-aligned so decimal points line up; a column
  // of left-aligned totals is unreadable at a glance.
  cellRight: { textAlign: 'right' },
  cellCenter: { textAlign: 'center' },

  totals: { marginTop: 14, marginLeft: 'auto', width: '48%' },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    color: PDF_COLORS.muted,
  },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1.5,
    borderTopColor: PDF_COLORS.primary,
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: PDF_COLORS.primary,
  },

  // No box — just a quiet, slightly indented caption line under the totals.
  amountWords: {
    marginTop: 16,
    fontSize: 9,
    fontStyle: 'italic',
  },
  amountWordsPrefix: { color: PDF_COLORS.muted },
  amountWordsValue: { fontFamily: 'Helvetica-Bold', fontStyle: 'normal', color: PDF_COLORS.text },

  signature: { marginTop: 32, alignItems: 'flex-end' },
  signatureLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    marginBottom: 24,
  },
  signatureLine: { width: 140, borderBottomWidth: 0.75, borderBottomColor: PDF_COLORS.border },

  notes: { marginTop: 18, color: PDF_COLORS.muted },

  footer: {
    position: 'absolute',
    bottom: 26,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: PDF_COLORS.muted,
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.border,
    paddingTop: 8,
  },
});

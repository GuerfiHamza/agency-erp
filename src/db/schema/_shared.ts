import { sql } from 'drizzle-orm';
import { char, integer, numeric, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Column building blocks shared by every table.
 *
 * These exist so the conventions below are declared once rather than retyped in
 * ~30 tables, where a single inconsistent column would be invisible in review.
 */

/**
 * Primary key.
 *
 * `defaultRandom()` emits `DEFAULT gen_random_uuid()`, which is required — not
 * cosmetic. Better Auth's Drizzle adapter reports `supportsUUIDs: true` for
 * Postgres, so with `generateId: "uuid"` it deliberately sends no id and expects
 * the database to supply one. A key without this default breaks sign-up.
 */
export const primaryKey = () => uuid('id').primaryKey().defaultRandom();

/**
 * Audit timestamps.
 *
 * `$onUpdate` only fires for Drizzle-issued updates; Better Auth sets its own
 * `updatedAt` through the adapter, so both paths stay correct.
 */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/**
 * Soft delete marker. `NULL` means live.
 *
 * Every read path must filter `deleted_at IS NULL`, and every unique constraint
 * on a soft-deletable table must be a partial index over live rows only (see
 * `liveRows`) — otherwise a deleted record keeps squatting on its email or
 * document number forever.
 */
export const softDelete = {
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

/** Predicate for partial indexes that should cover live rows only. */
export const liveRows = sql`deleted_at IS NULL`;

/**
 * Monetary amount.
 *
 * `numeric` is exact decimal, and Drizzle returns it as a string. That is
 * intentional: never parse these into a JS number for arithmetic — binary
 * floats cannot represent 0.10 and rounding drift in an ERP is a defect.
 * Do money math in SQL or a decimal library.
 */
export const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

/** Quantity with 3 decimals, enough for hours, weights, and part counts. */
export const quantity = (name: string) => numeric(name, { precision: 12, scale: 3 });

/** Percentage stored as 0.00–100.00 rather than a 0–1 fraction. */
export const percent = (name: string) => numeric(name, { precision: 5, scale: 2 });

/** ISO 4217 code, e.g. "USD". Stored per document so historical rows stay truthful. */
export const CURRENCY_LENGTH = 3;

/**
 * Line-item columns shared by quotes, proforma invoices, invoices, and purchase
 * orders. Their commercial shape is identical; only the parent document differs.
 *
 * `unitPrice` is copied onto the line at creation rather than referenced from a
 * catalogue: a price change next year must not silently rewrite last year's
 * invoice. `lineTotal` is stored, not derived on read, for the same reason —
 * the arithmetic that produced a legal document is part of the record.
 */
export const lineItemColumns = {
  description: text('description').notNull(),
  quantity: quantity('quantity').notNull().default('1'),
  unitPrice: money('unit_price').notNull(),
  discountPercent: percent('discount_percent').notNull().default('0'),
  taxRate: percent('tax_rate').notNull().default('0'),
  /** quantity × unitPrice, less discount, plus tax. Computed by the service. */
  lineTotal: money('line_total').notNull(),
  /** Display order on the printed document. */
  position: integer('position').notNull().default(0),
};

/**
 * Monetary totals shared by every commercial document.
 *
 * Denormalised deliberately: a document's totals are a historical fact, not a
 * live aggregate of its current lines.
 */
export const documentTotals = {
  subtotal: money('subtotal').notNull().default('0'),
  discountTotal: money('discount_total').notNull().default('0'),
  taxTotal: money('tax_total').notNull().default('0'),
  total: money('total').notNull().default('0'),
  currency: char('currency', { length: CURRENCY_LENGTH }).notNull(),
};

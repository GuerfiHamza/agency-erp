import { z } from 'zod';

import { DB_LIMITS } from '@/config/constants';

/**
 * Purchase order input schemas. Same line-item shape as Quotes/Proforma/
 * Invoices — `lineTotal` is never a form field, the service derives it via
 * `computeDocumentTotals`.
 *
 * Unlike Invoices, there is no `void` here: `sent`/`confirmed`/
 * `partially_received`/`received` are reached through dedicated transitions,
 * never a dropdown, but the terminal reversal is `cancelled` only — a
 * purchase order was never shown to a client, just a supplier, so there is no
 * "legal record" concern forcing a separate void verb.
 */

const optionalText = (max: number = DB_LIMITS.shortText) =>
  z
    .string()
    .trim()
    .max(max, { error: `Keep this under ${max} characters.` })
    .transform((value) => value || null)
    .nullable();

const optionalId = z
  .uuid()
  .or(z.literal('').transform(() => null))
  .nullable();

const optionalDate = z.coerce
  .date()
  .nullable()
  .or(z.literal('').transform(() => null));

const quantityString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/, { error: 'Enter a quantity like 1 or 2.5.' });

const moneyString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, { error: 'Enter an amount like 100 or 100.00.' });

const percentString = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, { error: 'Enter a percentage like 10 or 10.5.' })
  .refine((value) => Number(value) <= 100, { error: 'Cannot be above 100.' });

export const purchaseOrderLineItemSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, { error: 'Describe this line.' })
    .max(DB_LIMITS.shortText, { error: 'That description is too long.' }),
  quantity: quantityString,
  unitPrice: moneyString,
  discountPercent: percentString,
  taxRate: percentString,
});

export type PurchaseOrderLineItemInput = z.output<typeof purchaseOrderLineItemSchema>;

export const PURCHASE_ORDER_STATUSES = [
  'draft',
  'sent',
  'confirmed',
  'partially_received',
  'received',
  'cancelled',
] as const;

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const purchaseOrderFormSchema = z.object({
  supplierId: z.uuid({ error: 'Choose a supplier.' }),
  projectId: optionalId,

  title: optionalText(),
  issueDate: z.coerce.date({ error: 'Enter a valid issue date.' }),
  expectedDate: optionalDate,

  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, { error: 'Use a three-letter currency code, e.g. EUR.' }),

  notes: optionalText(DB_LIMITS.longText),
  terms: optionalText(DB_LIMITS.longText),

  items: z.array(purchaseOrderLineItemSchema).min(1, { error: 'Add at least one line item.' }),
});

export type PurchaseOrderFormValues = z.input<typeof purchaseOrderFormSchema>;
export type PurchaseOrderInput = z.output<typeof purchaseOrderFormSchema>;

export const PURCHASE_ORDER_SORT_FIELDS = [
  'number',
  'status',
  'issueDate',
  'expectedDate',
  'total',
  'createdAt',
] as const;

export type PurchaseOrderSortField = (typeof PURCHASE_ORDER_SORT_FIELDS)[number];

export function isPurchaseOrderSortField(value: string | null): value is PurchaseOrderSortField {
  return value !== null && (PURCHASE_ORDER_SORT_FIELDS as readonly string[]).includes(value);
}

export function toPurchaseOrderStatusFilters(values: string[]): PurchaseOrderStatus[] {
  return values.filter((value): value is PurchaseOrderStatus =>
    (PURCHASE_ORDER_STATUSES as readonly string[]).includes(value),
  );
}

/**
 * A delivery: quantities received *in this receipt*, added to each line's
 * running `quantityReceived` by the service — never a replacement total, so
 * two people recording separate deliveries on the same day cannot clobber
 * each other.
 */
export const receivePurchaseOrderSchema = z.object({
  lines: z
    .array(z.object({ itemId: z.uuid(), quantityReceived: quantityString }))
    .min(1, { error: 'Enter at least one received quantity.' }),
});

export type ReceivePurchaseOrderInput = z.output<typeof receivePurchaseOrderSchema>;

import { z } from 'zod';

import { DB_LIMITS } from '@/config/constants';

/**
 * Invoice input schemas. Same line-item shape as Quotes/Proforma —
 * `lineTotal` is never a form field, the service derives it via
 * `computeDocumentTotals`.
 *
 * Unlike Quotes/Proforma, this form only ever edits a **draft** invoice: once
 * sent, an invoice is the legal record and its content is locked (a real
 * change needs a credit note, out of scope here). `status` is therefore not
 * a form field at all — `sent`/`partially_paid`/`paid`/`overdue`/`cancelled`/
 * `void` are all reached through dedicated transitions, never a dropdown.
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

export const invoiceLineItemSchema = z.object({
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

export type InvoiceLineItemInput = z.output<typeof invoiceLineItemSchema>;

export const INVOICE_STATUSES = [
  'draft',
  'sent',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
  'void',
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const invoiceFormSchema = z.object({
  clientId: z.uuid({ error: 'Choose a client.' }),
  contactId: optionalId,
  projectId: optionalId,

  title: optionalText(),
  issueDate: z.coerce.date({ error: 'Enter a valid issue date.' }),
  dueDate: z.coerce.date({ error: 'Enter a valid due date.' }),

  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, { error: 'Use a three-letter currency code, e.g. EUR.' }),

  notes: optionalText(DB_LIMITS.longText),
  terms: optionalText(DB_LIMITS.longText),

  items: z.array(invoiceLineItemSchema).min(1, { error: 'Add at least one line item.' }),
});

export type InvoiceFormValues = z.input<typeof invoiceFormSchema>;
export type InvoiceInput = z.output<typeof invoiceFormSchema>;

export const INVOICE_SORT_FIELDS = [
  'number',
  'status',
  'issueDate',
  'dueDate',
  'total',
  'createdAt',
] as const;

export type InvoiceSortField = (typeof INVOICE_SORT_FIELDS)[number];

export function isInvoiceSortField(value: string | null): value is InvoiceSortField {
  return value !== null && (INVOICE_SORT_FIELDS as readonly string[]).includes(value);
}

export function toInvoiceStatusFilters(values: string[]): InvoiceStatus[] {
  return values.filter((value): value is InvoiceStatus =>
    (INVOICE_STATUSES as readonly string[]).includes(value),
  );
}

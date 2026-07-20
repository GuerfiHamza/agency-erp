import { z } from 'zod';

import { DB_LIMITS } from '@/config/constants';

/**
 * Proforma invoice input schemas. Same shape as a quote's — `lineTotal` is
 * never a form field, the service derives it and the document totals via
 * `computeDocumentTotals`.
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

const optionalDate = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? null : value),
  z.coerce.date({ error: 'Enter a valid date.' }).nullable(),
);

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

export const proformaLineItemSchema = z.object({
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

export type ProformaLineItemInput = z.output<typeof proformaLineItemSchema>;

/**
 * `converted` is deliberately not user-selectable — it means a real invoice
 * was issued from this document, which only the (future) Invoices module can
 * cause. It exists here only as a possible display value.
 */
export const PROFORMA_STATUSES = ['draft', 'sent', 'accepted', 'converted', 'cancelled'] as const;
export const PROFORMA_EDITABLE_STATUSES = ['draft', 'sent', 'accepted', 'cancelled'] as const;

export type ProformaStatus = (typeof PROFORMA_STATUSES)[number];

export const proformaFormSchema = z.object({
  clientId: z.uuid({ error: 'Choose a client.' }),
  contactId: optionalId,
  projectId: optionalId,

  title: optionalText(),
  status: z.enum(PROFORMA_EDITABLE_STATUSES),
  issueDate: z.coerce.date({ error: 'Enter a valid issue date.' }),
  validUntil: optionalDate,

  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, { error: 'Use a three-letter currency code, e.g. EUR.' }),

  notes: optionalText(DB_LIMITS.longText),
  terms: optionalText(DB_LIMITS.longText),

  items: z.array(proformaLineItemSchema).min(1, { error: 'Add at least one line item.' }),
});

export type ProformaFormValues = z.input<typeof proformaFormSchema>;
export type ProformaInput = z.output<typeof proformaFormSchema>;

export const PROFORMA_SORT_FIELDS = ['number', 'status', 'issueDate', 'total', 'createdAt'] as const;

export type ProformaSortField = (typeof PROFORMA_SORT_FIELDS)[number];

export function isProformaSortField(value: string | null): value is ProformaSortField {
  return value !== null && (PROFORMA_SORT_FIELDS as readonly string[]).includes(value);
}

export function toProformaStatusFilters(values: string[]): ProformaStatus[] {
  return values.filter((value): value is ProformaStatus =>
    (PROFORMA_STATUSES as readonly string[]).includes(value),
  );
}

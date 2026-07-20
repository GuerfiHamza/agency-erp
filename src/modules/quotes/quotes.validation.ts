import { z } from 'zod';

import { DB_LIMITS } from '@/config/constants';

/**
 * Quote input schemas. `lineTotal` is never a form field — the service derives
 * it (and the document totals) from `quantity`/`unitPrice`/`discountPercent`/
 * `taxRate` via `computeDocumentTotals`, matching `numeric` precision exactly.
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

export const quoteLineItemSchema = z.object({
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

export type QuoteLineItemInput = z.output<typeof quoteLineItemSchema>;

export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'cancelled'] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const quoteFormSchema = z.object({
  clientId: z.uuid({ error: 'Choose a client.' }),
  contactId: optionalId,
  opportunityId: optionalId,
  projectId: optionalId,

  title: optionalText(),
  status: z.enum(QUOTE_STATUSES),
  issueDate: z.coerce.date({ error: 'Enter a valid issue date.' }),
  validUntil: optionalDate,

  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, { error: 'Use a three-letter currency code, e.g. EUR.' }),

  notes: optionalText(DB_LIMITS.longText),
  terms: optionalText(DB_LIMITS.longText),

  items: z.array(quoteLineItemSchema).min(1, { error: 'Add at least one line item.' }),
});

export type QuoteFormValues = z.input<typeof quoteFormSchema>;
export type QuoteInput = z.output<typeof quoteFormSchema>;

export const QUOTE_SORT_FIELDS = ['number', 'status', 'issueDate', 'total', 'createdAt'] as const;

export type QuoteSortField = (typeof QUOTE_SORT_FIELDS)[number];

export function isQuoteSortField(value: string | null): value is QuoteSortField {
  return value !== null && (QUOTE_SORT_FIELDS as readonly string[]).includes(value);
}

export function toQuoteStatusFilters(values: string[]): QuoteStatus[] {
  return values.filter((value): value is QuoteStatus =>
    (QUOTE_STATUSES as readonly string[]).includes(value),
  );
}

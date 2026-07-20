import { z } from 'zod';

import { DB_LIMITS } from '@/config/constants';

/**
 * Lead input schemas.
 *
 * Shared by the form and the Server Action. Same `optionalText` / `currency`
 * conventions as clients — an untouched input posts `''`, and storing that
 * instead of `null` makes `email IS NULL` lie about whether it was ever filled.
 */

const optionalText = (max: number = DB_LIMITS.shortText) =>
  z
    .string()
    .trim()
    .max(max, { error: `Keep this under ${max} characters.` })
    .transform((value) => value || null)
    .nullable();

const optionalEmail = z
  .email({ error: 'Enter a valid email address.' })
  .max(DB_LIMITS.shortText)
  .or(z.literal(''))
  .transform((value) => value || null)
  .nullable();

/** Money as a canonical decimal string — never round-tripped through a float. Matches `numeric(14,2)`. */
const optionalMoney = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, { error: 'Enter an amount like 1500 or 1500.00.' })
  .or(z.literal('').transform(() => null))
  .nullable();

const optionalCurrency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, { error: 'Use a three-letter currency code, e.g. EUR.' })
  .or(z.literal('').transform(() => null))
  .nullable();

const optionalOwnerId = z
  .uuid()
  .or(z.literal('').transform(() => null))
  .nullable();

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'unqualified', 'converted'] as const;
export const LEAD_SOURCES = [
  'website',
  'referral',
  'cold_outreach',
  'social_media',
  'event',
  'advertisement',
  'other',
] as const;

export const leadFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: 'Enter the lead’s name.' })
    .max(DB_LIMITS.shortText, { error: 'That name is too long.' }),
  companyName: optionalText(),
  email: optionalEmail,
  phone: optionalText(40),

  status: z.enum(LEAD_STATUSES),
  source: z.enum(LEAD_SOURCES),
  estimatedValue: optionalMoney,
  currency: optionalCurrency,
  ownerId: optionalOwnerId,

  notes: optionalText(DB_LIMITS.longText),
});

export type LeadFormValues = z.input<typeof leadFormSchema>;
export type LeadInput = z.output<typeof leadFormSchema>;

/** Columns the leads table may be sorted by. Anything else is rejected, not ignored. */
export const LEAD_SORT_FIELDS = ['name', 'status', 'createdAt'] as const;

export type LeadSortField = (typeof LEAD_SORT_FIELDS)[number];

export function isLeadSortField(value: string | null): value is LeadSortField {
  return value !== null && (LEAD_SORT_FIELDS as readonly string[]).includes(value);
}

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function toLeadStatusFilters(values: string[]): LeadStatus[] {
  return values.filter((value): value is LeadStatus => (LEAD_STATUSES as readonly string[]).includes(value));
}

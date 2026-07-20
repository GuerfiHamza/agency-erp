import { z } from 'zod';

import { DB_LIMITS } from '@/config/constants';

/**
 * Client input schemas.
 *
 * Shared by the form (React Hook Form resolver) and the Server Action. The
 * client copy is for feedback; the server copy is the one that is trusted.
 *
 * The `optionalText` / `country` / `currency` patterns match the companies
 * module deliberately: an untouched input posts `''`, and storing that instead
 * of `null` makes `email IS NULL` — "was this ever filled in?" — silently answer
 * no for every client whose form was opened once.
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

const optionalWebsite = z
  .url({ error: 'Enter a full URL, including https://' })
  .max(DB_LIMITS.shortText)
  .or(z.literal(''))
  .transform((value) => value || null)
  .nullable();

/** ISO 3166-1 alpha-2, matching `char(2)`. Nullable — not every client has one on file. */
const optionalCountry = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, { error: 'Use a two-letter country code, e.g. FR.' })
  .or(z.literal('').transform(() => null))
  .nullable();

/** ISO 4217. Nullable: blank means "use the company default" rather than a forced value. */
const optionalCurrency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, { error: 'Use a three-letter currency code, e.g. EUR.' })
  .or(z.literal('').transform(() => null))
  .nullable();

/**
 * Net terms in days. Empty is a real answer (falls back to the company default),
 * so `''` becomes `null` before the numeric checks run.
 */
const paymentTermsDays = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? null : value),
  z.coerce
    .number({ error: 'Enter a number of days.' })
    .int({ error: 'Enter a whole number of days.' })
    .min(0, { error: 'Terms cannot be negative.' })
    .max(365, { error: 'Use 365 days or fewer.' })
    .nullable(),
);

/** Owner is a user id, or nobody. The `<select>` posts `''` for "unassigned". */
const optionalOwnerId = z
  .uuid()
  .or(z.literal('').transform(() => null))
  .nullable();

export const CLIENT_TYPES = ['company', 'individual'] as const;
export const CLIENT_STATUSES = ['prospect', 'active', 'inactive', 'archived'] as const;

export const clientFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: 'Enter the client name.' })
    .max(DB_LIMITS.shortText, { error: 'That name is too long.' }),
  type: z.enum(CLIENT_TYPES),
  status: z.enum(CLIENT_STATUSES),

  legalName: optionalText(),
  taxId: optionalText(),
  email: optionalEmail,
  phone: optionalText(40),
  website: optionalWebsite,

  addressLine1: optionalText(),
  addressLine2: optionalText(),
  city: optionalText(),
  state: optionalText(),
  postalCode: optionalText(20),
  country: optionalCountry,

  currency: optionalCurrency,
  paymentTermsDays,
  ownerId: optionalOwnerId,

  notes: optionalText(DB_LIMITS.longText),
});

export type ClientFormValues = z.input<typeof clientFormSchema>;
export type ClientInput = z.output<typeof clientFormSchema>;

/** Columns the clients table may be sorted by. Anything else is rejected, not ignored. */
export const CLIENT_SORT_FIELDS = ['name', 'status', 'createdAt'] as const;

export type ClientSortField = (typeof CLIENT_SORT_FIELDS)[number];

export function isClientSortField(value: string | null): value is ClientSortField {
  return value !== null && (CLIENT_SORT_FIELDS as readonly string[]).includes(value);
}

export type ClientStatus = (typeof CLIENT_STATUSES)[number];

/** Keep only real status values from an untrusted `?status=` list. */
export function toClientStatusFilters(values: string[]): ClientStatus[] {
  return values.filter((value): value is ClientStatus =>
    (CLIENT_STATUSES as readonly string[]).includes(value),
  );
}

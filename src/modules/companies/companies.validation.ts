import { z } from 'zod';

import { DB_LIMITS } from '@/config/constants';

/**
 * Company profile input.
 *
 * Shared by the settings form (React Hook Form resolver) and the Server Action.
 * The client copy gives feedback; the server copy is the one that is trusted.
 */

/**
 * Every optional text field goes through this.
 *
 * An untouched input posts `''`, not `undefined`. Stored as-is, the column holds
 * an empty string, and `taxId IS NULL` — the natural way to ask "has this been
 * filled in?" — quietly answers no for every company that opened the form once.
 * Normalising to `null` at the boundary keeps that question answerable.
 */
const optionalText = (max: number = DB_LIMITS.shortText) =>
  z
    .string()
    .trim()
    .max(max, { error: `Keep this under ${max} characters.` })
    .transform((value) => value || null)
    .nullable();

/**
 * ISO 3166-1 alpha-2, matching `char(2)` in the schema.
 *
 * Not an enum of all 249 codes: the list changes (South Sudan in 2011), and a
 * stale enum would reject a real customer's real country.
 */
const country = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, { error: 'Use a two-letter country code, e.g. FR.' })
  .transform((value) => value || null)
  .nullable()
  .or(z.literal('').transform(() => null));

/** ISO 4217. Same reasoning as `country`, and the column is `char(3)`. */
const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, { error: 'Use a three-letter currency code, e.g. EUR.' });

/**
 * Validated against the runtime's own zone database rather than a hardcoded list.
 *
 * `Intl.supportedValuesOf('timeZone')` is the same data the formatter will use,
 * so a zone that passes here cannot throw later when a due date is rendered.
 */
const timezone = z
  .string()
  .trim()
  .min(1, { error: 'Select a timezone.' })
  .refine(
    (value) => {
      try {
        // Throws RangeError on an unknown zone.
        new Intl.DateTimeFormat('en-US', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { error: 'That is not a recognised timezone.' },
  );

export const updateCompanySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: 'Enter your company name.' })
    .max(DB_LIMITS.shortText, { error: 'That company name is too long.' }),
  legalName: optionalText(),
  taxId: optionalText(),
  registrationNumber: optionalText(),
  nif: optionalText(),
  articleNumber: optionalText(),
  activity: optionalText(),
  managerName: optionalText(),
  documentReferenceCode: optionalText(20),

  // Not the shared `email` from auth.validation: that one is a sign-in
  // credential and lowercases. This is a public contact address on an invoice.
  email: z
    .email({ error: 'Enter a valid email address.' })
    .max(DB_LIMITS.shortText)
    .or(z.literal(''))
    .transform((value) => value || null)
    .nullable(),
  phone: optionalText(40),
  website: z
    .url({ error: 'Enter a full URL, including https://' })
    .max(DB_LIMITS.shortText)
    .or(z.literal(''))
    .transform((value) => value || null)
    .nullable(),

  addressLine1: optionalText(),
  addressLine2: optionalText(),
  city: optionalText(),
  state: optionalText(),
  postalCode: optionalText(20),
  country,

  logoUrl: optionalText(DB_LIMITS.mediumText),

  defaultCurrency: currency,
  timezone,
});

export type UpdateCompanyFormValues = z.input<typeof updateCompanySchema>;
export type UpdateCompanyInput = z.output<typeof updateCompanySchema>;

import { z } from 'zod';

import { DB_LIMITS } from '@/config/constants';

/**
 * Supplier input schemas. Same shape and normalization posture as Clients —
 * the counterpart on the purchasing side — minus the two fields a supplier
 * has no equivalent of: there is no `type` (a supplier is always an
 * organization) and no `ownerId` (no "account manager" concept here; the
 * closest thing is `contactName`, a plain text field, not a user).
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

/** ISO 3166-1 alpha-2, matching `char(2)`. Nullable — not every supplier has one on file. */
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
 * Net terms in days *the supplier grants us*. Empty is a real answer (no
 * agreed terms on file), so `''` becomes `null` before the numeric checks run.
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

export const SUPPLIER_STATUSES = ['active', 'inactive', 'archived'] as const;

export const supplierFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: 'Enter the supplier name.' })
    .max(DB_LIMITS.shortText, { error: 'That name is too long.' }),
  status: z.enum(SUPPLIER_STATUSES),

  legalName: optionalText(),
  taxId: optionalText(),
  email: optionalEmail,
  phone: optionalText(40),
  website: optionalWebsite,
  contactName: optionalText(),

  addressLine1: optionalText(),
  addressLine2: optionalText(),
  city: optionalText(),
  state: optionalText(),
  postalCode: optionalText(20),
  country: optionalCountry,

  currency: optionalCurrency,
  paymentTermsDays,

  notes: optionalText(DB_LIMITS.longText),
});

export type SupplierFormValues = z.input<typeof supplierFormSchema>;
export type SupplierInput = z.output<typeof supplierFormSchema>;

/** Columns the suppliers table may be sorted by. Anything else is rejected, not ignored. */
export const SUPPLIER_SORT_FIELDS = ['name', 'status', 'createdAt'] as const;

export type SupplierSortField = (typeof SUPPLIER_SORT_FIELDS)[number];

export function isSupplierSortField(value: string | null): value is SupplierSortField {
  return value !== null && (SUPPLIER_SORT_FIELDS as readonly string[]).includes(value);
}

export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

/** Keep only real status values from an untrusted `?status=` list. */
export function toSupplierStatusFilters(values: string[]): SupplierStatus[] {
  return values.filter((value): value is SupplierStatus =>
    (SUPPLIER_STATUSES as readonly string[]).includes(value),
  );
}

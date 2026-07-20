import { z } from 'zod';

import { DB_LIMITS } from '@/config/constants';

/**
 * Contact input schemas.
 *
 * A contact is a person at a client, so `clientId` is required. `isPrimary`
 * marks the default recipient for that client's documents — at most one per
 * client, enforced by a partial unique index and reconciled in the service.
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

export const contactFormSchema = z.object({
  clientId: z.uuid({ error: 'Choose a client.' }),
  firstName: z
    .string()
    .trim()
    .min(1, { error: 'Enter a first name.' })
    .max(DB_LIMITS.shortText, { error: 'That name is too long.' }),
  lastName: optionalText(),
  email: optionalEmail,
  phone: optionalText(40),
  mobile: optionalText(40),
  jobTitle: optionalText(),
  isPrimary: z.boolean(),
  notes: optionalText(DB_LIMITS.longText),
});

export type ContactFormValues = z.input<typeof contactFormSchema>;
export type ContactInput = z.output<typeof contactFormSchema>;

/** Columns the contacts table may be sorted by. Anything else is rejected, not ignored. */
export const CONTACT_SORT_FIELDS = ['firstName', 'createdAt'] as const;

export type ContactSortField = (typeof CONTACT_SORT_FIELDS)[number];

export function isContactSortField(value: string | null): value is ContactSortField {
  return value !== null && (CONTACT_SORT_FIELDS as readonly string[]).includes(value);
}

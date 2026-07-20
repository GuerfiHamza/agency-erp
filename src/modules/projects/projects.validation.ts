import { z } from 'zod';

import { DB_LIMITS } from '@/config/constants';

/**
 * Project input schemas.
 *
 * `code` is not here — it is generated server-side (`PRJ-{year}-{seq}`), unique
 * per company. `completedAt` is not here either — it is derived from the status.
 */

const optionalText = (max: number = DB_LIMITS.shortText) =>
  z
    .string()
    .trim()
    .max(max, { error: `Keep this under ${max} characters.` })
    .transform((value) => value || null)
    .nullable();

/** Money as a canonical decimal string — never round-tripped through a float. Matches `numeric(14,2)`. */
const optionalMoney = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, { error: 'Enter an amount like 1500 or 1500.00.' })
  .or(z.literal('').transform(() => null))
  .nullable();

/** Hours as a decimal string, up to three places. Matches `numeric(12,3)`. */
const optionalHours = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/, { error: 'Enter hours like 40 or 40.5.' })
  .or(z.literal('').transform(() => null))
  .nullable();

const optionalCurrency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, { error: 'Use a three-letter currency code, e.g. EUR.' })
  .or(z.literal('').transform(() => null))
  .nullable();

const optionalDate = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? null : value),
  z.coerce.date({ error: 'Enter a valid date.' }).nullable(),
);

const optionalId = z
  .uuid()
  .or(z.literal('').transform(() => null))
  .nullable();

export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled'] as const;
export const PROJECT_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const BILLING_TYPES = ['fixed_price', 'hourly', 'retainer', 'non_billable'] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** The one status that stamps `completedAt`. */
export const COMPLETED_STATUS: ProjectStatus = 'completed';

export const projectFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: 'Name this project.' })
    .max(DB_LIMITS.shortText, { error: 'That name is too long.' }),
  /** Internal projects have no client. */
  clientId: optionalId,
  description: optionalText(DB_LIMITS.longText),

  status: z.enum(PROJECT_STATUSES),
  priority: z.enum(PROJECT_PRIORITIES),
  billingType: z.enum(BILLING_TYPES),

  budget: optionalMoney,
  hourlyRate: optionalMoney,
  estimatedHours: optionalHours,
  currency: optionalCurrency,

  startDate: optionalDate,
  endDate: optionalDate,
  managerId: optionalId,
});

export type ProjectFormValues = z.input<typeof projectFormSchema>;
export type ProjectInput = z.output<typeof projectFormSchema>;

/** Columns the projects table may be sorted by. Anything else is rejected, not ignored. */
export const PROJECT_SORT_FIELDS = ['name', 'code', 'status', 'createdAt'] as const;

export type ProjectSortField = (typeof PROJECT_SORT_FIELDS)[number];

export function isProjectSortField(value: string | null): value is ProjectSortField {
  return value !== null && (PROJECT_SORT_FIELDS as readonly string[]).includes(value);
}

export function toProjectStatusFilters(values: string[]): ProjectStatus[] {
  return values.filter((value): value is ProjectStatus =>
    (PROJECT_STATUSES as readonly string[]).includes(value),
  );
}

import { z } from 'zod';

import { DB_LIMITS } from '@/config/constants';

/**
 * Opportunity input schemas.
 *
 * An opportunity is a qualified deal and always attaches to a real client, so
 * `clientId` is required — unlike a lead, which holds its own contact details.
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

const optionalCurrency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, { error: 'Use a three-letter currency code, e.g. EUR.' })
  .or(z.literal('').transform(() => null))
  .nullable();

/** 0–100, up to two decimals. Stored as a string in `numeric(5,2)`. */
const optionalProbability = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? null : value),
  z.coerce
    .number({ error: 'Enter a number between 0 and 100.' })
    .min(0, { error: 'Cannot be below 0.' })
    .max(100, { error: 'Cannot be above 100.' })
    .transform((n) => n.toString())
    .nullable(),
);

const optionalDate = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? null : value),
  z.coerce.date({ error: 'Enter a valid date.' }).nullable(),
);

const optionalOwnerId = z
  .uuid()
  .or(z.literal('').transform(() => null))
  .nullable();

/** A contact at the chosen client, or nobody. The service checks it belongs to that client. */
const optionalContactId = z
  .uuid()
  .or(z.literal('').transform(() => null))
  .nullable();

export const OPPORTUNITY_STAGES = [
  'discovery',
  'qualification',
  'proposal',
  'negotiation',
  'won',
  'lost',
] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

/** The two stages that close a deal — they drive `closedAt` in the service. */
export const CLOSED_STAGES: readonly OpportunityStage[] = ['won', 'lost'];

export const opportunityFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: 'Name this opportunity.' })
    .max(DB_LIMITS.shortText, { error: 'That name is too long.' }),
  clientId: z.uuid({ error: 'Choose a client.' }),
  contactId: optionalContactId,

  stage: z.enum(OPPORTUNITY_STAGES),
  value: optionalMoney,
  currency: optionalCurrency,
  probability: optionalProbability,

  expectedCloseDate: optionalDate,
  lostReason: optionalText(DB_LIMITS.longText),
  ownerId: optionalOwnerId,
});

export type OpportunityFormValues = z.input<typeof opportunityFormSchema>;
export type OpportunityInput = z.output<typeof opportunityFormSchema>;

/** Columns the opportunities table may be sorted by. Anything else is rejected, not ignored. */
export const OPPORTUNITY_SORT_FIELDS = ['name', 'stage', 'createdAt'] as const;

export type OpportunitySortField = (typeof OPPORTUNITY_SORT_FIELDS)[number];

export function isOpportunitySortField(value: string | null): value is OpportunitySortField {
  return value !== null && (OPPORTUNITY_SORT_FIELDS as readonly string[]).includes(value);
}

export function toOpportunityStageFilters(values: string[]): OpportunityStage[] {
  return values.filter((value): value is OpportunityStage =>
    (OPPORTUNITY_STAGES as readonly string[]).includes(value),
  );
}

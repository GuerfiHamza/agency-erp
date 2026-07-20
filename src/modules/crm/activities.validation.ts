import { z } from 'zod';

import { DB_LIMITS } from '@/config/constants';

/**
 * Activity input schemas.
 *
 * An activity is a logged interaction. It optionally links to exactly one of a
 * lead, client, or opportunity — modelled here as a `relatedKind` + `relatedId`
 * pair for the form, which the service resolves into the right foreign key. The
 * schema's `contactId` is not exposed yet (no Contacts UI until CRM entity 4).
 */

const optionalText = (max: number = DB_LIMITS.longText) =>
  z
    .string()
    .trim()
    .max(max, { error: `Keep this under ${max} characters.` })
    .transform((value) => value || null)
    .nullable();

export const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'note'] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** What an activity can hang off. `none` is valid — a standalone log entry. */
export const RELATED_KINDS = ['none', 'lead', 'client', 'opportunity'] as const;

export type RelatedKind = (typeof RELATED_KINDS)[number];

export const activityFormSchema = z
  .object({
    type: z.enum(ACTIVITY_TYPES),
    subject: z
      .string()
      .trim()
      .min(2, { error: 'Enter a subject.' })
      .max(DB_LIMITS.shortText, { error: 'That subject is too long.' }),
    body: optionalText(),
    // Required: an activity is a thing that happened at a time. The form defaults
    // it to now, so it is never blank in practice.
    occurredAt: z.coerce.date({ error: 'Enter a valid date and time.' }),

    relatedKind: z.enum(RELATED_KINDS),
    relatedId: z
      .uuid()
      .or(z.literal('').transform(() => null))
      .nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.relatedKind !== 'none' && !data.relatedId) {
      ctx.addIssue({ code: 'custom', path: ['relatedId'], message: 'Choose a record to link to.' });
    }
  });

export type ActivityFormValues = z.input<typeof activityFormSchema>;
export type ActivityInput = z.output<typeof activityFormSchema>;

/** Columns the activities table may be sorted by. Anything else is rejected, not ignored. */
export const ACTIVITY_SORT_FIELDS = ['subject', 'occurredAt', 'createdAt'] as const;

export type ActivitySortField = (typeof ACTIVITY_SORT_FIELDS)[number];

export function isActivitySortField(value: string | null): value is ActivitySortField {
  return value !== null && (ACTIVITY_SORT_FIELDS as readonly string[]).includes(value);
}

export function toActivityTypeFilters(values: string[]): ActivityType[] {
  return values.filter((value): value is ActivityType =>
    (ACTIVITY_TYPES as readonly string[]).includes(value),
  );
}

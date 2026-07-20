import { z } from 'zod';

import { DB_LIMITS } from '@/config/constants';

/**
 * Calendar event input schemas.
 *
 * An event optionally links to exactly one client, project, or task — a
 * `linkKind` + `linkId` pair here, one foreign key in the database, resolved by
 * the service. Same shape as an activity's link and a document's attachment.
 *
 * `recurrenceRule` and the attendee list are **not** form fields; see the module
 * notes in MEMORY.md for why they are deferred.
 */

const optionalText = (max: number = DB_LIMITS.longText) =>
  z
    .string()
    .trim()
    .max(max, { error: `Keep this under ${max} characters.` })
    .transform((value) => value || null)
    .nullable();

export const EVENT_TYPES = ['meeting', 'call', 'deadline', 'reminder', 'other'] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** What an event can hang off. `none` is valid — most events are just time. */
export const EVENT_LINK_KINDS = ['none', 'client', 'project', 'task'] as const;

export type EventLinkKind = (typeof EVENT_LINK_KINDS)[number];

export const eventFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, { error: 'Give the event a title.' })
      .max(DB_LIMITS.shortText, { error: 'That title is too long.' }),
    description: optionalText(),
    location: optionalText(DB_LIMITS.shortText),
    type: z.enum(EVENT_TYPES),

    startsAt: z.coerce.date({ error: 'Enter a valid start date and time.' }),
    endsAt: z.coerce.date({ error: 'Enter a valid end date and time.' }),
    isAllDay: z.boolean(),

    linkKind: z.enum(EVENT_LINK_KINDS),
    linkId: z
      .uuid()
      .or(z.literal('').transform(() => null))
      .nullable(),
  })
  .superRefine((data, ctx) => {
    // Equal is allowed — a zero-length marker at an instant is a legitimate
    // reminder. Ending before starting is not.
    if (data.endsAt.getTime() < data.startsAt.getTime()) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'The end must be after the start.' });
    }

    if (data.linkKind !== 'none' && !data.linkId) {
      ctx.addIssue({ code: 'custom', path: ['linkId'], message: 'Choose a record to link to.' });
    }
  });

export type EventFormValues = z.input<typeof eventFormSchema>;
export type EventInput = z.output<typeof eventFormSchema>;

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

/**
 * The visible month, as `YYYY-MM` in the URL.
 *
 * Bounds are computed in UTC and padded by a day at each end: the grid is
 * bucketed in the viewer's own time zone, which the server does not know, and a
 * day of padding covers every offset on earth (±14h).
 */
export function monthRange(month: string | null): { month: string; from: Date; to: Date } {
  const match = month ? MONTH_PATTERN.exec(month) : null;
  const now = new Date();

  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const monthIndex = match ? Number(match[2]) - 1 : now.getUTCMonth();

  // Date.UTC normalises out-of-range input (month 13 → next January), so a
  // crafted `?month=2026-99` shifts the view rather than producing NaN.
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const from = new Date(Date.UTC(year, monthIndex, 0));
  const to = new Date(Date.UTC(year, monthIndex + 1, 2));

  return { month: toMonthParam(first), from, to };
}

export function toMonthParam(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The month `offset` months away from `month`, for the prev/next links. */
export function shiftMonth(month: string, offset: number): string {
  const match = MONTH_PATTERN.exec(month);

  if (!match) return month;

  return toMonthParam(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + offset, 1)));
}

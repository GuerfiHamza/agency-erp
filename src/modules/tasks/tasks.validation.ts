import { z } from 'zod';

import { DB_LIMITS } from '@/config/constants';

/**
 * Task input schemas.
 *
 * A task always belongs to a project (`projectId` required). `completedAt`,
 * `createdById`, `loggedHours`, `position`, and `parentTaskId` are not form
 * fields — the first two are derived by the service, the rest are deferred
 * features (time tracking, board ordering, subtasks).
 */

const optionalText = (max: number = DB_LIMITS.longText) =>
  z
    .string()
    .trim()
    .max(max, { error: `Keep this under ${max} characters.` })
    .transform((value) => value || null)
    .nullable();

/** Hours as a decimal string, up to three places. Matches `numeric(12,3)`. */
const optionalHours = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/, { error: 'Enter hours like 8 or 8.5.' })
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

export const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'done', 'cancelled'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/** The one status that stamps `completedAt`. */
export const DONE_STATUS: TaskStatus = 'done';

export const taskFormSchema = z.object({
  projectId: z.uuid({ error: 'Choose a project.' }),
  title: z
    .string()
    .trim()
    .min(2, { error: 'Give the task a title.' })
    .max(DB_LIMITS.shortText, { error: 'That title is too long.' }),
  description: optionalText(),

  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  assigneeId: optionalId,

  estimatedHours: optionalHours,
  startDate: optionalDate,
  dueDate: optionalDate,
});

export type TaskFormValues = z.input<typeof taskFormSchema>;
export type TaskInput = z.output<typeof taskFormSchema>;

/** Columns the tasks table may be sorted by. Anything else is rejected, not ignored. */
export const TASK_SORT_FIELDS = ['title', 'status', 'dueDate', 'createdAt'] as const;

export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];

export function isTaskSortField(value: string | null): value is TaskSortField {
  return value !== null && (TASK_SORT_FIELDS as readonly string[]).includes(value);
}

export function toTaskStatusFilters(values: string[]): TaskStatus[] {
  return values.filter((value): value is TaskStatus => (TASK_STATUSES as readonly string[]).includes(value));
}

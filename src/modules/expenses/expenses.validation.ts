import { z } from 'zod';

import { DB_LIMITS } from '@/config/constants';

/**
 * Expense input schemas.
 *
 * A receipt is one optional storage key — the bytes are already uploaded by
 * the time anything here runs (see `FileUpload` + `presignUploadAction`, the
 * Documents pattern reused, but simpler: unlike `documents`, `expenses` has
 * no `mimeType`/`sizeBytes` columns, only `receiptStorageKey`, so there is
 * nothing else to carry). `expenseCreateSchema` is the only one that carries
 * it — same reasoning as Documents' `update`: replacing an already-submitted
 * expense's receipt would silently change what an approver already looked
 * at, so re-upload means creating a fresh expense, and the edit form simply
 * omits the dropzone.
 *
 * Only ever edits a **draft** expense — once submitted, content is locked
 * (same posture as every commercial document module); `status` therefore
 * has no form field at all. `draft`→`submitted`→`approved|rejected`→
 * `reimbursed` are all dedicated transitions.
 */

const optionalId = z
  .uuid()
  .or(z.literal('').transform(() => null))
  .nullable();

const moneyString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, { error: 'Enter an amount like 100 or 100.00.' })
  .refine((value) => Number(value) > 0, { error: 'Enter an amount greater than zero.' });

/** Tax is a real amount but may genuinely be zero — no receipts have negative tax. */
const taxAmountString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, { error: 'Enter an amount like 0 or 19.00.' });

export const EXPENSE_CATEGORIES = [
  'travel',
  'meals',
  'software',
  'hardware',
  'office',
  'marketing',
  'subcontractor',
  'utilities',
  'other',
] as const;

export const EXPENSE_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'reimbursed'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

const expenseFields = {
  description: z
    .string()
    .trim()
    .min(1, { error: 'Describe the expense.' })
    .max(DB_LIMITS.shortText, { error: 'That description is too long.' }),
  category: z.enum(EXPENSE_CATEGORIES),

  amount: moneyString,
  taxAmount: taxAmountString,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, { error: 'Use a three-letter currency code, e.g. EUR.' }),

  spentOn: z.coerce.date({ error: 'Enter the date on the receipt.' }),

  billable: z.boolean(),
  projectId: optionalId,
  supplierId: optionalId,
  /** Who incurred it — always a real person, never "unassigned"; the form defaults it to the actor. */
  userId: z.uuid({ error: 'Choose who incurred this expense.' }),
};

function billableRequiresProject(
  data: { billable: boolean; projectId: string | null },
  ctx: z.RefinementCtx,
): void {
  if (data.billable && !data.projectId) {
    ctx.addIssue({
      code: 'custom',
      path: ['projectId'],
      message: 'A billable expense must be linked to a project.',
    });
  }
}

/** Editable on both create and a draft edit. */
export const expenseDetailsSchema = z.object(expenseFields).superRefine(billableRequiresProject);

/** Create also carries the receipt upload, if one was attached. */
export const expenseCreateSchema = z
  .object({ ...expenseFields, receiptStorageKey: z.string().trim().max(DB_LIMITS.longText).nullable() })
  .superRefine(billableRequiresProject);

export type ExpenseDetailsValues = z.input<typeof expenseDetailsSchema>;
export type ExpenseDetailsInput = z.output<typeof expenseDetailsSchema>;
export type ExpenseCreateValues = z.input<typeof expenseCreateSchema>;
export type ExpenseCreateInput = z.output<typeof expenseCreateSchema>;

export const rejectExpenseSchema = z.object({
  rejectionReason: z
    .string()
    .trim()
    .min(1, { error: 'Say why this expense is being rejected.' })
    .max(DB_LIMITS.mediumText, { error: 'Keep the reason under 1,000 characters.' }),
});

export type RejectExpenseInput = z.output<typeof rejectExpenseSchema>;

export const EXPENSE_SORT_FIELDS = ['spentOn', 'amount', 'status', 'createdAt'] as const;

export type ExpenseSortField = (typeof EXPENSE_SORT_FIELDS)[number];

export function isExpenseSortField(value: string | null): value is ExpenseSortField {
  return value !== null && (EXPENSE_SORT_FIELDS as readonly string[]).includes(value);
}

export function toExpenseStatusFilters(values: string[]): ExpenseStatus[] {
  return values.filter((value): value is ExpenseStatus =>
    (EXPENSE_STATUSES as readonly string[]).includes(value),
  );
}

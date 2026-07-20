import { describe, expect, it } from 'vitest';

import { expenseCreateSchema, rejectExpenseSchema } from './expenses.validation';

/**
 * The billable-requires-project rule is a pure cross-field structural check
 * (no DB involved), so it lives in the schema's `superRefine`, not the
 * service — same posture as Calendar's end-after-start and Activities'
 * link-kind-requires-link-id rules. Tested here directly, the same way
 * `companies.validation.test.ts` and `users.validation.test.ts` cover their
 * schemas without a database.
 */

const base = {
  description: 'Taxi to client site',
  category: 'travel' as const,
  amount: '45.00',
  taxAmount: '0',
  currency: 'EUR',
  spentOn: new Date('2026-07-01T00:00:00Z'),
  userId: '11111111-1111-4111-8111-111111111111',
  supplierId: null,
  receiptStorageKey: null,
};

describe('expenseCreateSchema', () => {
  it('refuses a billable expense with no project', () => {
    const result = expenseCreateSchema.safeParse({ ...base, billable: true, projectId: null });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes('projectId'))).toBe(true);
  });

  it('accepts a billable expense with a project', () => {
    const result = expenseCreateSchema.safeParse({
      ...base,
      billable: true,
      projectId: '22222222-2222-4222-8222-222222222222',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a non-billable expense with no project', () => {
    const result = expenseCreateSchema.safeParse({ ...base, billable: false, projectId: null });

    expect(result.success).toBe(true);
  });
});

describe('rejectExpenseSchema', () => {
  it('requires a non-empty reason', () => {
    expect(rejectExpenseSchema.safeParse({ rejectionReason: '' }).success).toBe(false);
    expect(rejectExpenseSchema.safeParse({ rejectionReason: '   ' }).success).toBe(false);
    expect(rejectExpenseSchema.safeParse({ rejectionReason: 'Missing itemised receipt.' }).success).toBe(
      true,
    );
  });
});

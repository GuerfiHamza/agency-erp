import { eq, like, or } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { companies, projects, suppliers, user } from '@/db/schema';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';

import * as service from './expenses.service';
import type { ExpenseCreateInput, ExpenseDetailsInput } from './expenses.validation';

/**
 * Against the real Postgres. Pins the project/supplier/user tenant guards,
 * the receipt storage-key tenant guard, the draft-only edit lock, the full
 * submit→approve|reject→reimburse state machine (including every refusal),
 * the delete-restricted-to-draft/rejected rule, and cross-tenant access.
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG_A = 'vitest-expenses-a';
const SLUG_B = 'vitest-expenses-b';
const SUPPLIER_NAME = 'vitest-expenses-supplier';
const FIXTURE = 'vitest-expenses-';

/** `expenses.projectId`/`supplierId`/`userId` are all `set null` — the company cascade alone is enough. */
async function cleanup() {
  await db.delete(user).where(like(user.email, `${FIXTURE}%`));
  await db.delete(suppliers).where(like(suppliers.name, `${SUPPLIER_NAME}%`));
  await db.delete(companies).where(or(eq(companies.slug, SLUG_A), eq(companies.slug, SLUG_B)));
}

beforeEach(cleanup);
afterAll(cleanup);

async function fixture(slug: string) {
  const [company] = await db.insert(companies).values({ name: 'Vitest Co', slug }).returning();
  if (!company) throw new Error('fixture company failed');

  const [approver] = await db
    .insert(user)
    .values({
      name: 'Approver',
      email: `${FIXTURE}approver-${slug}@nexus.test`,
      emailVerified: true,
      companyId: company.id,
    })
    .returning();
  const [employee] = await db
    .insert(user)
    .values({
      name: 'Employee',
      email: `${FIXTURE}employee-${slug}@nexus.test`,
      emailVerified: true,
      companyId: company.id,
    })
    .returning();
  const [project] = await db
    .insert(projects)
    .values({ companyId: company.id, name: 'Website', code: `PRJ-${slug}-1` })
    .returning();
  const [supplier] = await db
    .insert(suppliers)
    .values({ companyId: company.id, name: SUPPLIER_NAME })
    .returning();

  if (!approver || !employee || !project || !supplier) throw new Error('fixture failed');

  return { company, approver, employee, project, supplier };
}

function base(employeeId: string): ExpenseCreateInput {
  return {
    description: 'Taxi to client site',
    category: 'travel',
    amount: '45.00',
    taxAmount: '0',
    currency: 'EUR',
    spentOn: new Date('2026-07-01T00:00:00Z'),
    billable: false,
    projectId: null,
    supplierId: null,
    userId: employeeId,
    receiptStorageKey: null,
  };
}

function withoutReceipt(input: ExpenseCreateInput): ExpenseDetailsInput {
  const { receiptStorageKey: _receiptStorageKey, ...rest } = input;
  return rest;
}

async function draftExpense(companyId: string, employeeId: string) {
  return service.createExpense(companyId, base(employeeId));
}

async function submittedExpense(companyId: string, employeeId: string) {
  const created = await draftExpense(companyId, employeeId);
  await service.submitExpense(companyId, created.id);
  return created;
}

async function approvedExpense(companyId: string, approverId: string, employeeId: string) {
  const created = await submittedExpense(companyId, employeeId);
  await service.approveExpense(companyId, approverId, created.id);
  return created;
}

describe('createExpense', () => {
  it('stores the expense as an unstamped draft', async () => {
    const f = await fixture(SLUG_A);

    const expense = await service.createExpense(f.company.id, base(f.employee.id));

    expect(expense.status).toBe('draft');
    expect(expense.userId).toBe(f.employee.id);
    expect(expense.submittedAt).toBeNull();
    expect(expense.approvedAt).toBeNull();
  });
});

describe('link tenant guards', () => {
  it('refuses a project from another tenant', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await expect(
      service.createExpense(a.company.id, {
        ...base(a.employee.id),
        billable: true,
        projectId: b.project.id,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses a supplier from another tenant', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await expect(
      service.createExpense(a.company.id, { ...base(a.employee.id), supplierId: b.supplier.id }),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses a user from another tenant', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);

    await expect(service.createExpense(a.company.id, base(b.employee.id))).rejects.toThrow(ValidationError);
  });
});

describe('receipt storage key guard', () => {
  it('refuses a key that does not belong to this company', async () => {
    const f = await fixture(SLUG_A);

    await expect(
      service.createExpense(f.company.id, {
        ...base(f.employee.id),
        receiptStorageKey: 'some-other-company-id/receipts/file.jpg',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('accepts a key under this company prefix', async () => {
    const f = await fixture(SLUG_A);

    const expense = await service.createExpense(f.company.id, {
      ...base(f.employee.id),
      receiptStorageKey: `${f.company.id}/receipts/taxi.jpg`,
    });

    expect(expense.receiptStorageKey).toBe(`${f.company.id}/receipts/taxi.jpg`);
  });
});

describe('updateExpense', () => {
  it('edits a draft', async () => {
    const f = await fixture(SLUG_A);
    const created = await draftExpense(f.company.id, f.employee.id);

    const updated = await service.updateExpense(
      f.company.id,
      created.id,
      withoutReceipt({ ...base(f.employee.id), amount: '99.00' }),
    );

    expect(updated.amount).toBe('99.00');
  });

  it('refuses to edit once submitted', async () => {
    const f = await fixture(SLUG_A);
    const created = await submittedExpense(f.company.id, f.employee.id);

    await expect(
      service.updateExpense(f.company.id, created.id, withoutReceipt(base(f.employee.id))),
    ).rejects.toThrow(ConflictError);
  });
});

describe('submitExpense', () => {
  it('moves a draft to submitted and stamps submittedAt', async () => {
    const f = await fixture(SLUG_A);
    const created = await draftExpense(f.company.id, f.employee.id);

    const submitted = await service.submitExpense(f.company.id, created.id);

    expect(submitted.status).toBe('submitted');
    expect(submitted.submittedAt).not.toBeNull();
  });

  it('refuses to submit a non-draft expense', async () => {
    const f = await fixture(SLUG_A);
    const created = await submittedExpense(f.company.id, f.employee.id);

    await expect(service.submitExpense(f.company.id, created.id)).rejects.toThrow(ConflictError);
  });
});

describe('approveExpense', () => {
  it('moves a submitted expense to approved and stamps the approver', async () => {
    const f = await fixture(SLUG_A);
    const created = await submittedExpense(f.company.id, f.employee.id);

    const approved = await service.approveExpense(f.company.id, f.approver.id, created.id);

    expect(approved.status).toBe('approved');
    expect(approved.approvedById).toBe(f.approver.id);
    expect(approved.approvedAt).not.toBeNull();
  });

  it('refuses to approve a draft', async () => {
    const f = await fixture(SLUG_A);
    const created = await draftExpense(f.company.id, f.employee.id);

    await expect(service.approveExpense(f.company.id, f.approver.id, created.id)).rejects.toThrow(
      ConflictError,
    );
  });
});

describe('rejectExpense', () => {
  it('moves a submitted expense to rejected and records the reason', async () => {
    const f = await fixture(SLUG_A);
    const created = await submittedExpense(f.company.id, f.employee.id);

    const rejected = await service.rejectExpense(f.company.id, created.id, 'Missing itemised receipt.');

    expect(rejected.status).toBe('rejected');
    expect(rejected.rejectedAt).not.toBeNull();
    expect(rejected.rejectionReason).toBe('Missing itemised receipt.');
  });

  it('refuses to reject a draft', async () => {
    const f = await fixture(SLUG_A);
    const created = await draftExpense(f.company.id, f.employee.id);

    await expect(service.rejectExpense(f.company.id, created.id, 'No.')).rejects.toThrow(ConflictError);
  });
});

describe('reimburseExpense', () => {
  it('moves an approved expense to reimbursed', async () => {
    const f = await fixture(SLUG_A);
    const created = await approvedExpense(f.company.id, f.approver.id, f.employee.id);

    const reimbursed = await service.reimburseExpense(f.company.id, created.id);

    expect(reimbursed.status).toBe('reimbursed');
    expect(reimbursed.reimbursedAt).not.toBeNull();
  });

  it('refuses to reimburse a submitted (not yet approved) expense', async () => {
    const f = await fixture(SLUG_A);
    const created = await submittedExpense(f.company.id, f.employee.id);

    await expect(service.reimburseExpense(f.company.id, created.id)).rejects.toThrow(ConflictError);
  });
});

describe('deleteExpense', () => {
  it('deletes a draft', async () => {
    const f = await fixture(SLUG_A);
    const created = await draftExpense(f.company.id, f.employee.id);

    await service.deleteExpense(f.company.id, created.id);

    await expect(service.getExpense(f.company.id, created.id)).rejects.toThrow(NotFoundError);
  });

  it('deletes a rejected expense', async () => {
    const f = await fixture(SLUG_A);
    const created = await submittedExpense(f.company.id, f.employee.id);
    await service.rejectExpense(f.company.id, created.id, 'No.');

    await service.deleteExpense(f.company.id, created.id);

    await expect(service.getExpense(f.company.id, created.id)).rejects.toThrow(NotFoundError);
  });

  it('refuses to delete a submitted expense', async () => {
    const f = await fixture(SLUG_A);
    const created = await submittedExpense(f.company.id, f.employee.id);

    await expect(service.deleteExpense(f.company.id, created.id)).rejects.toThrow(ConflictError);
  });

  it('refuses to delete an approved expense', async () => {
    const f = await fixture(SLUG_A);
    const created = await approvedExpense(f.company.id, f.approver.id, f.employee.id);

    await expect(service.deleteExpense(f.company.id, created.id)).rejects.toThrow(ConflictError);
  });
});

describe('cross-tenant access', () => {
  it('cannot read, update, or delete another company’s expense', async () => {
    const a = await fixture(SLUG_A);
    const b = await fixture(SLUG_B);
    const bExpense = await draftExpense(b.company.id, b.employee.id);

    await expect(service.getExpense(a.company.id, bExpense.id)).rejects.toThrow(NotFoundError);
    await expect(
      service.updateExpense(a.company.id, bExpense.id, withoutReceipt(base(a.employee.id))),
    ).rejects.toThrow(NotFoundError);
    await expect(service.deleteExpense(a.company.id, bExpense.id)).rejects.toThrow(NotFoundError);
  });
});

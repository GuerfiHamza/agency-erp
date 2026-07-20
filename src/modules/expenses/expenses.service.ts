import 'server-only';

import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import * as projectsService from '@/modules/projects/projects.service';
import * as suppliersService from '@/modules/suppliers/suppliers.service';

import * as repository from './expenses.repository';
import type { ExpenseCreateInput, ExpenseDetailsInput } from './expenses.validation';

/**
 * Expense rules.
 *
 * Only ever edits a **draft** expense — the same content-lock every
 * commercial document module uses — and the status machine is
 * `draft → submitted → approved | rejected`, with `approved → reimbursed` as
 * a separate step. There is no dedicated permission for submit/approve/
 * reject/reimburse beyond `expenses:approve` (for approve/reject/reimburse,
 * all three are spend-authority actions) and `expenses:update` (for submit,
 * the owner's own action) — see the actions module note.
 */

export type { ExpenseListItem, ListExpensesQuery } from './expenses.repository';

async function assertProjectInCompany(companyId: string, projectId: string | null): Promise<void> {
  if (!projectId) return;

  try {
    await projectsService.getProject(companyId, projectId);
  } catch {
    throw new ValidationError('That project does not exist in this workspace.');
  }
}

async function assertSupplierInCompany(companyId: string, supplierId: string | null): Promise<void> {
  if (!supplierId) return;

  try {
    await suppliersService.getSupplier(companyId, supplierId);
  } catch {
    throw new ValidationError('That supplier does not exist in this workspace.');
  }
}

async function assertUserInCompany(companyId: string, userId: string): Promise<void> {
  if (!(await repository.userBelongsToCompany(companyId, userId))) {
    throw new ValidationError('That person does not belong to this workspace.');
  }
}

/** `buildStorageKey` derives every key from the caller's company — same guard as Documents. */
function assertOwnStorageKey(companyId: string, storageKey: string): void {
  if (!storageKey.startsWith(`${companyId}/`)) {
    logger.warn('Cross-tenant storage key rejected', { companyId, storageKey });
    throw new ValidationError('That upload could not be found. Please try uploading the file again.');
  }
}

async function assertLinks(
  companyId: string,
  input: { projectId: string | null; supplierId: string | null; userId: string },
): Promise<void> {
  await assertProjectInCompany(companyId, input.projectId);
  await assertSupplierInCompany(companyId, input.supplierId);
  await assertUserInCompany(companyId, input.userId);
}

export async function listExpenses(companyId: string, query: repository.ListExpensesQuery) {
  return repository.listExpenses(companyId, query);
}

export async function getExpense(companyId: string, id: string) {
  const found = await repository.findById(companyId, id);

  if (!found) throw new NotFoundError('Expense not found.');

  return found;
}

export async function listProjectOptions(companyId: string) {
  return repository.listProjectOptions(companyId);
}

export async function listSupplierOptions(companyId: string) {
  return repository.listSupplierOptions(companyId);
}

export async function listUserOptions(companyId: string) {
  return repository.listUserOptions(companyId);
}

export async function createExpense(companyId: string, input: ExpenseCreateInput) {
  await assertLinks(companyId, input);

  if (input.receiptStorageKey) assertOwnStorageKey(companyId, input.receiptStorageKey);

  const created = await repository.create(companyId, input);

  logger.info('Expense created', { companyId, expenseId: created.id });

  return created;
}

/** A draft-only edit — the receipt, once attached, is never replaced (see the validation module note). */
export async function updateExpense(companyId: string, id: string, input: ExpenseDetailsInput) {
  const existing = await getExpense(companyId, id);

  if (existing.status !== 'draft') {
    throw new ConflictError('Only a draft expense can be edited.');
  }

  await assertLinks(companyId, input);

  const updated = await repository.update(companyId, id, input);

  if (!updated) throw new NotFoundError('Expense not found.');

  logger.info('Expense updated', { companyId, expenseId: id });

  return updated;
}

/** The one-click "submit for approval" action — only a draft can be submitted. */
export async function submitExpense(companyId: string, id: string) {
  const existing = await getExpense(companyId, id);

  if (existing.status !== 'draft') {
    throw new ConflictError('Only a draft expense can be submitted.');
  }

  const updated = await repository.updateStatus(companyId, id, {
    status: 'submitted',
    submittedAt: new Date(),
  });

  if (!updated) throw new NotFoundError('Expense not found.');

  logger.info('Expense submitted', { companyId, expenseId: id });

  return updated;
}

export async function approveExpense(companyId: string, actorUserId: string, id: string) {
  const existing = await getExpense(companyId, id);

  if (existing.status !== 'submitted') {
    throw new ConflictError('Only a submitted expense can be approved.');
  }

  const updated = await repository.updateStatus(companyId, id, {
    status: 'approved',
    approvedById: actorUserId,
    approvedAt: new Date(),
  });

  if (!updated) throw new NotFoundError('Expense not found.');

  logger.info('Expense approved', { companyId, expenseId: id, approvedById: actorUserId });

  return updated;
}

export async function rejectExpense(companyId: string, id: string, rejectionReason: string) {
  const existing = await getExpense(companyId, id);

  if (existing.status !== 'submitted') {
    throw new ConflictError('Only a submitted expense can be rejected.');
  }

  const updated = await repository.updateStatus(companyId, id, {
    status: 'rejected',
    rejectedAt: new Date(),
    rejectionReason,
  });

  if (!updated) throw new NotFoundError('Expense not found.');

  logger.info('Expense rejected', { companyId, expenseId: id });

  return updated;
}

/** Money actually paid back to the person who incurred it — only reachable once approved. */
export async function reimburseExpense(companyId: string, id: string) {
  const existing = await getExpense(companyId, id);

  if (existing.status !== 'approved') {
    throw new ConflictError('Only an approved expense can be reimbursed.');
  }

  const updated = await repository.updateStatus(companyId, id, {
    status: 'reimbursed',
    reimbursedAt: new Date(),
  });

  if (!updated) throw new NotFoundError('Expense not found.');

  logger.info('Expense reimbursed', { companyId, expenseId: id });

  return updated;
}

/**
 * Deletion is refused for anything that ever left `draft`, except `rejected`
 * — the same "an issued record stays on file" posture as every other
 * document module, with `rejected` playing the role Invoices gives
 * `cancelled`: a dead end that can still be cleaned up.
 */
export async function deleteExpense(companyId: string, id: string) {
  const existing = await getExpense(companyId, id);

  if (existing.status !== 'draft' && existing.status !== 'rejected') {
    throw new ConflictError('Only a draft or rejected expense can be deleted.');
  }

  const deleted = await repository.softDelete(companyId, id);

  if (!deleted) throw new NotFoundError('Expense not found.');

  logger.info('Expense deleted', { companyId, expenseId: id });

  return deleted;
}

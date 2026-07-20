'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { err, ok, type Result } from '@/types';

import * as service from './expenses.service';
import { expenseCreateSchema, expenseDetailsSchema, rejectExpenseSchema } from './expenses.validation';

/**
 * Expense Server Actions. Each re-establishes the session, re-checks its
 * permission, and re-validates its input. The tenant comes from the
 * session, never from the payload.
 *
 * There is no `expenses:submit` in the catalogue — submitting your own
 * draft is gated by `expenses:update`, the same permission that lets you
 * edit it. `approve`/`reject`/`reimburse` are all spend-authority actions,
 * gated by `expenses:approve`.
 */

const EXPENSES_PATH = '/dashboard/expenses';

const idSchema = z.object({ expenseId: z.uuid() });

export async function createExpenseAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('expenses:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = expenseCreateSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createExpense(companyId, parsed.data);
    revalidatePath(EXPENSES_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create expense', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function updateExpenseAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('expenses:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsedId = idSchema.safeParse(input);
  const parsed = expenseDetailsSchema.safeParse(input);

  if (!parsedId.success) return err(toErrorPayload(validationErrorFromZod(parsedId.error)));
  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.updateExpense(companyId, parsedId.data.expenseId, parsed.data);
    revalidatePath(EXPENSES_PATH);

    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update expense', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deleteExpenseAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('expenses:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deleteExpense(companyId, parsed.data.expenseId);
    revalidatePath(EXPENSES_PATH);

    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete expense', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function submitExpenseAction(input: unknown): Promise<Result<{ submitted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('expenses:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.submitExpense(companyId, parsed.data.expenseId);
    revalidatePath(EXPENSES_PATH);

    return ok({ submitted: true });
  } catch (error) {
    logger.error('Failed to submit expense', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function approveExpenseAction(input: unknown): Promise<Result<{ approved: true }>> {
  const { companyId, userId } = await requireTenantSession();

  try {
    await requirePermission('expenses:approve');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.approveExpense(companyId, userId, parsed.data.expenseId);
    revalidatePath(EXPENSES_PATH);

    return ok({ approved: true });
  } catch (error) {
    logger.error('Failed to approve expense', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function rejectExpenseAction(input: unknown): Promise<Result<{ rejected: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('expenses:approve');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsedId = idSchema.safeParse(input);
  const parsed = rejectExpenseSchema.safeParse(input);

  if (!parsedId.success) return err(toErrorPayload(validationErrorFromZod(parsedId.error)));
  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.rejectExpense(companyId, parsedId.data.expenseId, parsed.data.rejectionReason);
    revalidatePath(EXPENSES_PATH);

    return ok({ rejected: true });
  } catch (error) {
    logger.error('Failed to reject expense', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function reimburseExpenseAction(input: unknown): Promise<Result<{ reimbursed: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('expenses:approve');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.reimburseExpense(companyId, parsed.data.expenseId);
    revalidatePath(EXPENSES_PATH);

    return ok({ reimbursed: true });
  } catch (error) {
    logger.error('Failed to reimburse expense', { error, companyId });
    return err(toErrorPayload(error));
  }
}

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toCsv } from '@/lib/csv';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { SORT_DIRECTIONS } from '@/lib/table/search-params';
import { err, ok, type Result } from '@/types';

import * as service from './payments.service';
import {
  isPaymentSortField,
  paymentFormSchema,
  paymentUpdateSchema,
  toPaymentDirectionFilters,
  toPaymentStatusFilters,
} from './payments.validation';

/**
 * Payment Server Actions. Each re-establishes the session, re-checks its
 * permission, and re-validates its input. The tenant and actor come from the
 * session, never from the payload.
 *
 * `markCompleted`/`markFailed`/`refund` have no dedicated permission slug —
 * all three are status transitions on a payment the caller must already be
 * able to update, gated by `payments:update`, same posture Invoices used for
 * void/cancel.
 */

const PAYMENTS_PATH = '/dashboard/payments';

const idSchema = z.object({ paymentId: z.uuid() });

export async function createPaymentAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId, userId } = await requireTenantSession();

  try {
    await requirePermission('payments:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = paymentFormSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createPayment(companyId, userId, parsed.data);
    revalidatePath(PAYMENTS_PATH);
    revalidatePath('/dashboard/invoices');

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create payment', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function updatePaymentAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('payments:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsedId = idSchema.safeParse(input);
  const parsed = paymentUpdateSchema.safeParse(input);

  if (!parsedId.success) return err(toErrorPayload(validationErrorFromZod(parsedId.error)));
  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.updatePayment(companyId, parsedId.data.paymentId, parsed.data);
    revalidatePath(PAYMENTS_PATH);

    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update payment', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deletePaymentAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('payments:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deletePayment(companyId, parsed.data.paymentId);
    revalidatePath(PAYMENTS_PATH);

    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete payment', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function markPaymentCompletedAction(input: unknown): Promise<Result<{ completed: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('payments:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.markPaymentCompleted(companyId, parsed.data.paymentId);
    revalidatePath(PAYMENTS_PATH);
    revalidatePath('/dashboard/invoices');

    return ok({ completed: true });
  } catch (error) {
    logger.error('Failed to complete payment', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function markPaymentFailedAction(input: unknown): Promise<Result<{ failed: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('payments:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.markPaymentFailed(companyId, parsed.data.paymentId);
    revalidatePath(PAYMENTS_PATH);

    return ok({ failed: true });
  } catch (error) {
    logger.error('Failed to fail payment', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function refundPaymentAction(input: unknown): Promise<Result<{ refunded: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('payments:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.refundPayment(companyId, parsed.data.paymentId);
    revalidatePath(PAYMENTS_PATH);
    revalidatePath('/dashboard/invoices');

    return ok({ refunded: true });
  } catch (error) {
    logger.error('Failed to refund payment', { error, companyId });
    return err(toErrorPayload(error));
  }
}

const dateFormatter = new Intl.DateTimeFormat('en-CA'); // YYYY-MM-DD, sorts and parses cleanly.

const EXPORT_HEADERS = [
  'Direction',
  'Status',
  'Method',
  'Amount',
  'Currency',
  'Paid at',
  'Document',
  'Counterparty',
  'Reference',
  'Created',
];

export async function exportPaymentsAction(
  input: unknown,
): Promise<Result<{ filename: string; csv: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('payments:export');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = z
    .object({
      q: z.string().optional(),
      sort: z.string().nullish(),
      order: z.enum(SORT_DIRECTIONS).optional(),
      status: z.array(z.string()).optional(),
    })
    .safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  const { q, sort, order, status } = parsed.data;

  try {
    const rows = await service.exportPayments(companyId, {
      search: q || undefined,
      sort: isPaymentSortField(sort ?? null)
        ? { field: sort as never, direction: order ?? 'asc' }
        : undefined,
      statuses: toPaymentStatusFilters(status ?? []),
      // The toolbar's one filter slot is repurposed for direction — see the validation module note.
      directions: toPaymentDirectionFilters(status ?? []),
    });

    const csv = toCsv(
      EXPORT_HEADERS,
      rows.map((row) => [
        row.direction,
        row.status,
        row.method,
        row.amount,
        row.currency,
        dateFormatter.format(row.paidAt),
        row.documentNumber,
        row.counterpartyName,
        row.reference,
        dateFormatter.format(row.createdAt),
      ]),
    );

    const filename = `payments-${dateFormatter.format(new Date())}.csv`;

    return ok({ filename, csv });
  } catch (error) {
    logger.error('Failed to export payments', { error, companyId });
    return err(toErrorPayload(error));
  }
}

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { err, ok, type Result } from '@/types';

import * as service from './purchase-orders.service';
import { purchaseOrderFormSchema, receivePurchaseOrderSchema } from './purchase-orders.validation';

/**
 * Purchase order Server Actions. Each re-establishes the session, re-checks
 * its permission, and re-validates its input. The tenant and author come
 * from the session, never from the payload.
 *
 * There is no `purchase_orders:export` in the catalogue (unlike Invoices),
 * so there is no export action here — nothing to gate it on.
 *
 * `confirm`/`cancel` have no dedicated permission slug either, so both are
 * gated by `purchase_orders:update`, same posture as Invoices gating void/
 * cancel on `invoices:update`.
 */

const PURCHASE_ORDERS_PATH = '/dashboard/purchase-orders';

const idSchema = z.object({ purchaseOrderId: z.uuid() });

export async function createPurchaseOrderAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId, userId } = await requireTenantSession();

  try {
    await requirePermission('purchase_orders:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = purchaseOrderFormSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createPurchaseOrder(companyId, userId, parsed.data);
    revalidatePath(PURCHASE_ORDERS_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create purchase order', { error, companyId });
    return err(toErrorPayload(error));
  }
}

/** Fetches a purchase order with its line items for the edit/receive dialogs — the list row omits them. */
export async function getPurchaseOrderAction(
  input: unknown,
): Promise<Result<Awaited<ReturnType<typeof service.getPurchaseOrder>>>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('purchase_orders:read');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const purchaseOrder = await service.getPurchaseOrder(companyId, parsed.data.purchaseOrderId);
    return ok(purchaseOrder);
  } catch (error) {
    return err(toErrorPayload(error));
  }
}

export async function updatePurchaseOrderAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('purchase_orders:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsedId = idSchema.safeParse(input);
  const parsed = purchaseOrderFormSchema.safeParse(input);

  if (!parsedId.success) return err(toErrorPayload(validationErrorFromZod(parsedId.error)));
  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.updatePurchaseOrder(companyId, parsedId.data.purchaseOrderId, parsed.data);
    revalidatePath(PURCHASE_ORDERS_PATH);

    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update purchase order', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deletePurchaseOrderAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('purchase_orders:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deletePurchaseOrder(companyId, parsed.data.purchaseOrderId);
    revalidatePath(PURCHASE_ORDERS_PATH);

    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete purchase order', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function sendPurchaseOrderAction(input: unknown): Promise<Result<{ sent: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('purchase_orders:send');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.sendPurchaseOrder(companyId, parsed.data.purchaseOrderId);
    revalidatePath(PURCHASE_ORDERS_PATH);

    return ok({ sent: true });
  } catch (error) {
    logger.error('Failed to send purchase order', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function approvePurchaseOrderAction(input: unknown): Promise<Result<{ approved: true }>> {
  const { companyId, userId } = await requireTenantSession();

  try {
    await requirePermission('purchase_orders:approve');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.approvePurchaseOrder(companyId, userId, parsed.data.purchaseOrderId);
    revalidatePath(PURCHASE_ORDERS_PATH);

    return ok({ approved: true });
  } catch (error) {
    logger.error('Failed to approve purchase order', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function confirmPurchaseOrderAction(input: unknown): Promise<Result<{ confirmed: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('purchase_orders:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.confirmPurchaseOrder(companyId, parsed.data.purchaseOrderId);
    revalidatePath(PURCHASE_ORDERS_PATH);

    return ok({ confirmed: true });
  } catch (error) {
    logger.error('Failed to confirm purchase order', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function receivePurchaseOrderAction(input: unknown): Promise<Result<{ received: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('purchase_orders:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsedId = idSchema.safeParse(input);
  const parsedLines = receivePurchaseOrderSchema.safeParse(input);

  if (!parsedId.success) return err(toErrorPayload(validationErrorFromZod(parsedId.error)));
  if (!parsedLines.success) return err(toErrorPayload(validationErrorFromZod(parsedLines.error)));

  try {
    await service.receivePurchaseOrder(companyId, parsedId.data.purchaseOrderId, parsedLines.data.lines);
    revalidatePath(PURCHASE_ORDERS_PATH);

    return ok({ received: true });
  } catch (error) {
    logger.error('Failed to record receipt for purchase order', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function cancelPurchaseOrderAction(input: unknown): Promise<Result<{ cancelled: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('purchase_orders:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.cancelPurchaseOrder(companyId, parsed.data.purchaseOrderId);
    revalidatePath(PURCHASE_ORDERS_PATH);

    return ok({ cancelled: true });
  } catch (error) {
    logger.error('Failed to cancel purchase order', { error, companyId });
    return err(toErrorPayload(error));
  }
}

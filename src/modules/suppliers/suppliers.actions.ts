'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { err, ok, type Result } from '@/types';

import * as service from './suppliers.service';
import { supplierFormSchema } from './suppliers.validation';

/**
 * Supplier Server Actions.
 *
 * Each is a public HTTP endpoint: it re-establishes the session, re-checks
 * its permission, and re-validates its input. The tenant always comes from
 * the session, never from the payload.
 *
 * There is no `suppliers:export` in the permission catalogue (unlike
 * Clients), so there is no export action here — nothing to gate it on.
 */

const SUPPLIERS_PATH = '/dashboard/suppliers';

const supplierIdSchema = z.object({ supplierId: z.uuid() });

const quickCreateSupplierSchema = z.object({
  name: z.string().trim().min(2, { error: 'Enter the supplier name.' }),
});

/**
 * The "+ New supplier" item inside another form's supplier picker
 * (`CreatableSelectField`) — same validation and permission as
 * `createSupplierAction`, with every optional field defaulted to its
 * untouched-form value.
 */
export async function quickCreateSupplierAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('suppliers:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = quickCreateSupplierSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  const values = supplierFormSchema.parse({
    name: parsed.data.name,
    status: 'active',
    legalName: '',
    taxId: '',
    email: '',
    phone: '',
    website: '',
    contactName: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    currency: '',
    paymentTermsDays: '',
    notes: '',
  });

  try {
    const created = await service.createSupplier(companyId, values);
    revalidatePath(SUPPLIERS_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to quick-create supplier', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function createSupplierAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('suppliers:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = supplierFormSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createSupplier(companyId, parsed.data);
    revalidatePath(SUPPLIERS_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create supplier', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function updateSupplierAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('suppliers:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = supplierIdSchema.merge(supplierFormSchema).safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  const { supplierId, ...values } = parsed.data;

  try {
    await service.updateSupplier(companyId, supplierId, values);
    revalidatePath(SUPPLIERS_PATH);

    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update supplier', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deleteSupplierAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('suppliers:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = supplierIdSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deleteSupplier(companyId, parsed.data.supplierId);
    revalidatePath(SUPPLIERS_PATH);

    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete supplier', { error, companyId });
    return err(toErrorPayload(error));
  }
}

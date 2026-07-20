'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toCsv } from '@/lib/csv';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { SORT_DIRECTIONS } from '@/lib/table/search-params';
import { err, ok, type Result } from '@/types';

import * as service from './invoices.service';
import { invoiceFormSchema, isInvoiceSortField, toInvoiceStatusFilters } from './invoices.validation';

/**
 * Invoice Server Actions. Each re-establishes the session, re-checks its
 * permission, and re-validates its input. The tenant and author come from the
 * session, never from the payload.
 *
 * There is no dedicated `void`/`cancel` permission in the catalogue — both are
 * status transitions on an invoice the caller must already be able to update,
 * so they are gated by `invoices:update`, same as Quotes gates a status edit.
 */

const INVOICES_PATH = '/dashboard/invoices';

const idSchema = z.object({ invoiceId: z.uuid() });

export async function createInvoiceAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId, userId } = await requireTenantSession();

  try {
    await requirePermission('invoices:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = invoiceFormSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createInvoice(companyId, userId, parsed.data);
    revalidatePath(INVOICES_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create invoice', { error, companyId });
    return err(toErrorPayload(error));
  }
}

const fromQuoteSchema = z.object({ quoteId: z.uuid(), dueDate: z.coerce.date() });

export async function createInvoiceFromQuoteAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId, userId } = await requireTenantSession();

  try {
    await requirePermission('invoices:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = fromQuoteSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createInvoiceFromQuote(
      companyId,
      userId,
      parsed.data.quoteId,
      parsed.data.dueDate,
    );
    revalidatePath(INVOICES_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create invoice from quote', { error, companyId });
    return err(toErrorPayload(error));
  }
}

const fromProformaSchema = z.object({ proformaInvoiceId: z.uuid(), dueDate: z.coerce.date() });

export async function createInvoiceFromProformaAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId, userId } = await requireTenantSession();

  try {
    await requirePermission('invoices:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = fromProformaSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createInvoiceFromProforma(
      companyId,
      userId,
      parsed.data.proformaInvoiceId,
      parsed.data.dueDate,
    );
    revalidatePath(INVOICES_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create invoice from proforma invoice', { error, companyId });
    return err(toErrorPayload(error));
  }
}

/** Fetches an invoice with its line items for the edit dialog — the list row omits them. */
export async function getInvoiceAction(
  input: unknown,
): Promise<Result<Awaited<ReturnType<typeof service.getInvoice>>>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('invoices:read');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const invoice = await service.getInvoice(companyId, parsed.data.invoiceId);
    return ok(invoice);
  } catch (error) {
    return err(toErrorPayload(error));
  }
}

export async function updateInvoiceAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('invoices:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsedId = idSchema.safeParse(input);
  const parsed = invoiceFormSchema.safeParse(input);

  if (!parsedId.success) return err(toErrorPayload(validationErrorFromZod(parsedId.error)));
  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.updateInvoice(companyId, parsedId.data.invoiceId, parsed.data);
    revalidatePath(INVOICES_PATH);

    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update invoice', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deleteInvoiceAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('invoices:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deleteInvoice(companyId, parsed.data.invoiceId);
    revalidatePath(INVOICES_PATH);

    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete invoice', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function sendInvoiceAction(input: unknown): Promise<Result<{ sent: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('invoices:send');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.sendInvoice(companyId, parsed.data.invoiceId);
    revalidatePath(INVOICES_PATH);

    return ok({ sent: true });
  } catch (error) {
    logger.error('Failed to send invoice', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function voidInvoiceAction(input: unknown): Promise<Result<{ voided: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('invoices:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.voidInvoice(companyId, parsed.data.invoiceId);
    revalidatePath(INVOICES_PATH);

    return ok({ voided: true });
  } catch (error) {
    logger.error('Failed to void invoice', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function cancelInvoiceAction(input: unknown): Promise<Result<{ cancelled: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('invoices:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.cancelInvoice(companyId, parsed.data.invoiceId);
    revalidatePath(INVOICES_PATH);

    return ok({ cancelled: true });
  } catch (error) {
    logger.error('Failed to cancel invoice', { error, companyId });
    return err(toErrorPayload(error));
  }
}

const dateFormatter = new Intl.DateTimeFormat('en-CA');

const EXPORT_HEADERS = [
  'Number',
  'Client',
  'Status',
  'Issue date',
  'Due date',
  'Currency',
  'Total',
  'Paid',
  'Created',
];

export async function exportInvoicesAction(
  input: unknown,
): Promise<Result<{ filename: string; csv: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('invoices:export');
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
    const { items: rows } = await service.listInvoices(companyId, {
      page: 1,
      pageSize: 10_000,
      search: q || undefined,
      sort: isInvoiceSortField(sort ?? null)
        ? { field: sort as never, direction: order ?? 'asc' }
        : undefined,
      statuses: toInvoiceStatusFilters(status ?? []),
    });

    const csv = toCsv(
      EXPORT_HEADERS,
      rows.map((row) => [
        row.number,
        row.clientName,
        row.status,
        dateFormatter.format(row.issueDate),
        dateFormatter.format(row.dueDate),
        row.currency,
        row.total,
        row.amountPaid,
        dateFormatter.format(row.createdAt),
      ]),
    );

    const filename = `invoices-${dateFormatter.format(new Date())}.csv`;

    return ok({ filename, csv });
  } catch (error) {
    logger.error('Failed to export invoices', { error, companyId });
    return err(toErrorPayload(error));
  }
}

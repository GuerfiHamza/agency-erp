'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toCsv } from '@/lib/csv';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { SORT_DIRECTIONS } from '@/lib/table/search-params';
import { err, ok, type Result } from '@/types';

import * as service from './proforma-invoices.service';
import {
  isProformaSortField,
  proformaFormSchema,
  toProformaStatusFilters,
} from './proforma-invoices.validation';

/**
 * Proforma invoice Server Actions. Each re-establishes the session, re-checks
 * its permission, and re-validates its input. The tenant and author come from
 * the session, never from the payload.
 */

const PROFORMAS_PATH = '/dashboard/proforma-invoices';

const idSchema = z.object({ proformaInvoiceId: z.uuid() });

export async function createProformaAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId, userId } = await requireTenantSession();

  try {
    await requirePermission('proforma_invoices:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = proformaFormSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createProforma(companyId, userId, parsed.data);
    revalidatePath(PROFORMAS_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create proforma invoice', { error, companyId });
    return err(toErrorPayload(error));
  }
}

const fromQuoteSchema = z.object({ quoteId: z.uuid() });

export async function createProformaFromQuoteAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId, userId } = await requireTenantSession();

  try {
    await requirePermission('proforma_invoices:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = fromQuoteSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createProformaFromQuote(companyId, userId, parsed.data.quoteId);
    revalidatePath(PROFORMAS_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create proforma invoice from quote', { error, companyId });
    return err(toErrorPayload(error));
  }
}

/** Fetches a proforma with its line items for the edit dialog — the list row omits them. */
export async function getProformaAction(
  input: unknown,
): Promise<Result<Awaited<ReturnType<typeof service.getProforma>>>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('proforma_invoices:read');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const proforma = await service.getProforma(companyId, parsed.data.proformaInvoiceId);
    return ok(proforma);
  } catch (error) {
    return err(toErrorPayload(error));
  }
}

export async function updateProformaAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('proforma_invoices:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsedId = idSchema.safeParse(input);
  const parsed = proformaFormSchema.safeParse(input);

  if (!parsedId.success) return err(toErrorPayload(validationErrorFromZod(parsedId.error)));
  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.updateProforma(companyId, parsedId.data.proformaInvoiceId, parsed.data);
    revalidatePath(PROFORMAS_PATH);

    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update proforma invoice', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deleteProformaAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('proforma_invoices:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deleteProforma(companyId, parsed.data.proformaInvoiceId);
    revalidatePath(PROFORMAS_PATH);

    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete proforma invoice', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function sendProformaAction(input: unknown): Promise<Result<{ sent: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('proforma_invoices:send');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.sendProforma(companyId, parsed.data.proformaInvoiceId);
    revalidatePath(PROFORMAS_PATH);

    return ok({ sent: true });
  } catch (error) {
    logger.error('Failed to send proforma invoice', { error, companyId });
    return err(toErrorPayload(error));
  }
}

const dateFormatter = new Intl.DateTimeFormat('en-CA');

const EXPORT_HEADERS = [
  'Number',
  'Client',
  'Status',
  'Issue date',
  'Valid until',
  'Currency',
  'Total',
  'Created',
];

export async function exportProformasAction(
  input: unknown,
): Promise<Result<{ filename: string; csv: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('proforma_invoices:export');
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
    const { items: rows } = await service.listProformas(companyId, {
      page: 1,
      pageSize: 10_000,
      search: q || undefined,
      sort: isProformaSortField(sort ?? null)
        ? { field: sort as never, direction: order ?? 'asc' }
        : undefined,
      statuses: toProformaStatusFilters(status ?? []),
    });

    const csv = toCsv(
      EXPORT_HEADERS,
      rows.map((row) => [
        row.number,
        row.clientName,
        row.status,
        dateFormatter.format(row.issueDate),
        row.validUntil ? dateFormatter.format(row.validUntil) : null,
        row.currency,
        row.total,
        dateFormatter.format(row.createdAt),
      ]),
    );

    const filename = `proforma-invoices-${dateFormatter.format(new Date())}.csv`;

    return ok({ filename, csv });
  } catch (error) {
    logger.error('Failed to export proforma invoices', { error, companyId });
    return err(toErrorPayload(error));
  }
}

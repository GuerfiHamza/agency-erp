'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toCsv } from '@/lib/csv';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { SORT_DIRECTIONS } from '@/lib/table/search-params';
import { err, ok, type Result } from '@/types';

import * as service from './quotes.service';
import { isQuoteSortField, quoteFormSchema, toQuoteStatusFilters } from './quotes.validation';

/**
 * Quote Server Actions. Each re-establishes the session, re-checks its
 * permission, and re-validates its input. The tenant and author come from the
 * session, never from the payload.
 */

const QUOTES_PATH = '/dashboard/quotes';

const idSchema = z.object({ quoteId: z.uuid() });

export async function createQuoteAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId, userId } = await requireTenantSession();

  try {
    await requirePermission('quotes:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = quoteFormSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createQuote(companyId, userId, parsed.data);
    revalidatePath(QUOTES_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create quote', { error, companyId });
    return err(toErrorPayload(error));
  }
}

/** Fetches a quote with its line items for the edit dialog — the list row omits them. */
export async function getQuoteAction(
  input: unknown,
): Promise<Result<Awaited<ReturnType<typeof service.getQuote>>>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('quotes:read');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const quote = await service.getQuote(companyId, parsed.data.quoteId);
    return ok(quote);
  } catch (error) {
    return err(toErrorPayload(error));
  }
}

export async function updateQuoteAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('quotes:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsedId = idSchema.safeParse(input);
  const parsed = quoteFormSchema.safeParse(input);

  if (!parsedId.success) return err(toErrorPayload(validationErrorFromZod(parsedId.error)));
  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.updateQuote(companyId, parsedId.data.quoteId, parsed.data);
    revalidatePath(QUOTES_PATH);

    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update quote', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deleteQuoteAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('quotes:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deleteQuote(companyId, parsed.data.quoteId);
    revalidatePath(QUOTES_PATH);

    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete quote', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function sendQuoteAction(input: unknown): Promise<Result<{ sent: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('quotes:send');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = idSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.sendQuote(companyId, parsed.data.quoteId);
    revalidatePath(QUOTES_PATH);

    return ok({ sent: true });
  } catch (error) {
    logger.error('Failed to send quote', { error, companyId });
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

export async function exportQuotesAction(input: unknown): Promise<Result<{ filename: string; csv: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('quotes:export');
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
    const { items: rows } = await service.listQuotes(companyId, {
      page: 1,
      pageSize: 10_000,
      search: q || undefined,
      sort: isQuoteSortField(sort ?? null) ? { field: sort as never, direction: order ?? 'asc' } : undefined,
      statuses: toQuoteStatusFilters(status ?? []),
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

    const filename = `quotes-${dateFormatter.format(new Date())}.csv`;

    return ok({ filename, csv });
  } catch (error) {
    logger.error('Failed to export quotes', { error, companyId });
    return err(toErrorPayload(error));
  }
}

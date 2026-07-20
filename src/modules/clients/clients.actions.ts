'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission, requireTenantSession } from '@/lib/auth/session';
import { toCsv } from '@/lib/csv';
import { toErrorPayload, validationErrorFromZod } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { SORT_DIRECTIONS } from '@/lib/table/search-params';
import { err, ok, type Result } from '@/types';

import * as service from './clients.service';
import { clientFormSchema, isClientSortField, toClientStatusFilters } from './clients.validation';

/**
 * Client Server Actions.
 *
 * Each is a public HTTP endpoint: it re-establishes the session, re-checks its
 * permission, and re-validates its input. The tenant always comes from the
 * session, never from the payload.
 */

const CLIENTS_PATH = '/dashboard/clients';

const clientIdSchema = z.object({ clientId: z.uuid() });

export async function createClientAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('clients:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = clientFormSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    const created = await service.createClient(companyId, parsed.data);
    revalidatePath(CLIENTS_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to create client', { error, companyId });
    return err(toErrorPayload(error));
  }
}

const quickCreateClientSchema = z.object({
  name: z.string().trim().min(2, { error: 'Enter the client name.' }),
});

/**
 * The "+ New client" item inside another form's client picker
 * (`CreatableSelectField`) — same validation, same permission, same service
 * call as `createClientAction`, just with every optional field defaulted to
 * its untouched-form value instead of read out of a full form. Nothing here
 * is a shortcut around the schema; `clientFormSchema` still runs.
 */
export async function quickCreateClientAction(input: unknown): Promise<Result<{ id: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('clients:create');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = quickCreateClientSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  const values = clientFormSchema.parse({
    name: parsed.data.name,
    type: 'company',
    status: 'prospect',
    legalName: '',
    taxId: '',
    email: '',
    phone: '',
    website: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    currency: '',
    paymentTermsDays: '',
    ownerId: '',
    notes: '',
  });

  try {
    const created = await service.createClient(companyId, values);
    revalidatePath(CLIENTS_PATH);

    return ok({ id: created.id });
  } catch (error) {
    logger.error('Failed to quick-create client', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function updateClientAction(input: unknown): Promise<Result<{ updated: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('clients:update');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = clientIdSchema.merge(clientFormSchema).safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  const { clientId, ...values } = parsed.data;

  try {
    await service.updateClient(companyId, clientId, values);
    revalidatePath(CLIENTS_PATH);

    return ok({ updated: true });
  } catch (error) {
    logger.error('Failed to update client', { error, companyId });
    return err(toErrorPayload(error));
  }
}

export async function deleteClientAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('clients:delete');
  } catch (error) {
    return err(toErrorPayload(error));
  }

  const parsed = clientIdSchema.safeParse(input);

  if (!parsed.success) return err(toErrorPayload(validationErrorFromZod(parsed.error)));

  try {
    await service.deleteClient(companyId, parsed.data.clientId);
    revalidatePath(CLIENTS_PATH);

    return ok({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete client', { error, companyId });
    return err(toErrorPayload(error));
  }
}

const dateFormatter = new Intl.DateTimeFormat('en-CA'); // YYYY-MM-DD, sorts and parses cleanly.

const EXPORT_HEADERS = [
  'Name',
  'Type',
  'Status',
  'Email',
  'Phone',
  'Website',
  'City',
  'Country',
  'Owner',
  'Created',
];

/**
 * Export the clients matching the current filters as CSV.
 *
 * Takes the table's live URL params so the download is exactly what is on
 * screen, filters and all. Returns the CSV text rather than streaming a file —
 * the browser turns it into a download, which keeps this a plain action.
 */
export async function exportClientsAction(
  input: unknown,
): Promise<Result<{ filename: string; csv: string }>> {
  const { companyId } = await requireTenantSession();

  try {
    await requirePermission('clients:export');
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
    const rows = await service.exportClients(companyId, {
      search: q || undefined,
      sort: isClientSortField(sort ?? null) ? { field: sort as never, direction: order ?? 'asc' } : undefined,
      statuses: toClientStatusFilters(status ?? []),
    });

    const csv = toCsv(
      EXPORT_HEADERS,
      rows.map((row) => [
        row.name,
        row.type,
        row.status,
        row.email,
        row.phone,
        row.website,
        row.city,
        row.country,
        row.ownerName,
        dateFormatter.format(row.createdAt),
      ]),
    );

    const filename = `clients-${dateFormatter.format(new Date())}.csv`;

    return ok({ filename, csv });
  } catch (error) {
    logger.error('Failed to export clients', { error, companyId });
    return err(toErrorPayload(error));
  }
}

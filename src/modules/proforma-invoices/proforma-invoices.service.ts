import 'server-only';

import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { computeDocumentTotals, computeLineTotals } from '@/lib/money';
import * as quotesService from '@/modules/quotes/quotes.service';

import * as repository from './proforma-invoices.repository';
import type { ProformaInput, ProformaLineItemInput, ProformaStatus } from './proforma-invoices.validation';

/**
 * Proforma invoice rules — the same shape as Quotes (number generation, tenant
 * guards, derived status timestamps, decimal-math totals), plus the one thing
 * unique to this document: it can be created from an existing quote.
 */

export type { ProformaListItem, ProformaWithItems, ListProformasQuery } from './proforma-invoices.repository';

async function assertClientInCompany(companyId: string, clientId: string): Promise<void> {
  if (!(await repository.clientBelongsToCompany(companyId, clientId))) {
    throw new ValidationError('That client does not exist in this workspace.');
  }
}

async function assertContactOnClient(
  companyId: string,
  clientId: string,
  contactId: string | null,
): Promise<void> {
  if (!contactId) return;
  if (!(await repository.contactBelongsToClient(companyId, clientId, contactId))) {
    throw new ValidationError('That contact is not on the selected client.');
  }
}

async function assertProjectInCompany(companyId: string, projectId: string | null): Promise<void> {
  if (!projectId) return;
  if (!(await repository.projectBelongsToCompany(companyId, projectId))) {
    throw new ValidationError('That project does not exist in this workspace.');
  }
}

/**
 * Next free proforma number, `PRO-{year}-{seq}`. Same seed-then-walk approach
 * as a quote's `number` — the partial unique index is the real guarantee.
 */
async function generateNumber(companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  let seq = (await repository.countAllProformas(companyId)) + 1;

  for (let attempt = 0; attempt < 1000; attempt++) {
    const number = `PRO-${year}-${String(seq).padStart(4, '0')}`;
    if (!(await repository.isNumberTaken(companyId, number))) return number;
    seq++;
  }

  throw new Error('Could not allocate a proforma number');
}

/** Set on first leaving draft, cleared on returning to it — the Quote `sentAt` rule. */
function deriveSentAt(status: ProformaStatus, existing: Date | null): Date | null {
  return status === 'draft' ? null : (existing ?? new Date());
}

function toItemsWrite(items: ProformaLineItemInput[]): repository.ProformaItemWrite[] {
  return items.map((item, index) => ({
    ...item,
    lineTotal: computeLineTotals(item).lineTotal,
    position: index,
  }));
}

async function assertLinks(companyId: string, input: ProformaInput): Promise<void> {
  await assertClientInCompany(companyId, input.clientId);
  await assertContactOnClient(companyId, input.clientId, input.contactId);
  await assertProjectInCompany(companyId, input.projectId);
}

export async function listProformas(companyId: string, query: repository.ListProformasQuery) {
  return repository.listProformas(companyId, query);
}

export async function getProforma(companyId: string, id: string) {
  const found = await repository.findById(companyId, id);

  if (!found) throw new NotFoundError('Proforma invoice not found.');

  return found;
}

export async function listClientOptions(companyId: string) {
  return repository.listClientOptions(companyId);
}

export async function listProjectOptions(companyId: string) {
  return repository.listProjectOptions(companyId);
}

export async function listContactsByClient(
  companyId: string,
): Promise<Record<string, { id: string; name: string }[]>> {
  const rows = await repository.listContactsByClient(companyId);

  const grouped: Record<string, { id: string; name: string }[]> = {};
  for (const row of rows) {
    (grouped[row.clientId] ??= []).push({ id: row.id, name: row.name });
  }

  return grouped;
}

async function createInternal(
  companyId: string,
  actorUserId: string,
  input: ProformaInput,
  quoteId: string | null,
) {
  await assertLinks(companyId, input);

  const { items, ...header } = input;
  const number = await generateNumber(companyId);
  const totals = computeDocumentTotals(items);

  const created = await repository.create(
    companyId,
    {
      ...header,
      ...totals,
      number,
      quoteId,
      createdById: actorUserId,
      sentAt: deriveSentAt(header.status, null),
    },
    toItemsWrite(items),
  );

  logger.info('Proforma invoice created', { companyId, proformaInvoiceId: created.id, number, quoteId });

  return created;
}

export async function createProforma(companyId: string, actorUserId: string, input: ProformaInput) {
  return createInternal(companyId, actorUserId, input, null);
}

/**
 * Creates a proforma pre-filled from a quote's client, contact, project, and
 * line items — a convenience, not a single-use conversion: nothing in the
 * schema enforces a quote can only spawn one proforma (unlike a lead's
 * `convertedClientId`), so nothing here does either. `getQuote` already
 * tenant-checks the source.
 */
export async function createProformaFromQuote(companyId: string, actorUserId: string, quoteId: string) {
  const quote = await quotesService.getQuote(companyId, quoteId);

  const input: ProformaInput = {
    clientId: quote.clientId,
    contactId: quote.contactId,
    projectId: quote.projectId,
    title: quote.title,
    status: 'draft',
    issueDate: new Date(),
    validUntil: quote.validUntil,
    currency: quote.currency,
    notes: quote.notes,
    terms: quote.terms,
    items: quote.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      taxRate: item.taxRate,
    })),
  };

  return createInternal(companyId, actorUserId, input, quoteId);
}

export async function updateProforma(companyId: string, id: string, input: ProformaInput) {
  const existing = await getProforma(companyId, id);

  await assertLinks(companyId, input);

  const { items, ...header } = input;
  const totals = computeDocumentTotals(items);

  const updated = await repository.update(
    companyId,
    id,
    {
      ...header,
      ...totals,
      sentAt: deriveSentAt(header.status, existing.sentAt),
    },
    toItemsWrite(items),
  );

  if (!updated) throw new NotFoundError('Proforma invoice not found.');

  logger.info('Proforma invoice updated', { companyId, proformaInvoiceId: id });

  return updated;
}

/** The one-click "send" action, distinct from a general status edit — only a draft can be sent. */
export async function sendProforma(companyId: string, id: string) {
  const existing = await getProforma(companyId, id);

  if (existing.status !== 'draft') {
    throw new ConflictError('Only a draft proforma invoice can be sent.');
  }

  const updated = await repository.updateStatus(companyId, id, { status: 'sent', sentAt: new Date() });

  if (!updated) throw new NotFoundError('Proforma invoice not found.');

  logger.info('Proforma invoice sent', { companyId, proformaInvoiceId: id });

  return updated;
}

/**
 * Called by the Invoices module after it has created a real invoice from this
 * proforma. Only `sent`/`accepted` may convert — not `draft` (never issued)
 * and not an already-`converted` one (a second invoice from the same proforma
 * is a decision for the Invoices module, not something this stamp should hide
 * by silently succeeding twice).
 */
export async function markConverted(companyId: string, id: string) {
  const existing = await getProforma(companyId, id);

  if (existing.status !== 'sent' && existing.status !== 'accepted') {
    throw new ConflictError('Only a sent or accepted proforma invoice can be converted.');
  }

  const updated = await repository.markConverted(companyId, id);

  if (!updated) throw new NotFoundError('Proforma invoice not found.');

  logger.info('Proforma invoice marked converted', { companyId, proformaInvoiceId: id });

  return updated;
}

export async function deleteProforma(companyId: string, id: string) {
  const deleted = await repository.softDelete(companyId, id);

  if (!deleted) throw new NotFoundError('Proforma invoice not found.');

  logger.info('Proforma invoice deleted', { companyId, proformaInvoiceId: id });

  return deleted;
}

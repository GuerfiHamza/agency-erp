import 'server-only';

import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { computeDocumentTotals, computeLineTotals } from '@/lib/money';
import * as proformasService from '@/modules/proforma-invoices/proforma-invoices.service';
import * as quotesService from '@/modules/quotes/quotes.service';

import * as repository from './invoices.repository';
import type { InvoiceInput, InvoiceLineItemInput } from './invoices.validation';

/**
 * Invoice rules.
 *
 * The defining difference from Quotes/Proforma: this is the legal record.
 * Once it leaves `draft` its content is locked — `updateInvoice` refuses
 * anything else — and it can never be deleted once `sent`, only voided. Both
 * are enforced here, not just in the UI.
 */

export type { InvoiceListItem, InvoiceWithItems, ListInvoicesQuery } from './invoices.repository';

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
 * Next free invoice number, `INV-{year}-{seq}`. Same seed-then-walk approach
 * as a quote's `number` — the partial unique index is the real guarantee.
 *
 * Gaplessness (the schema's "legally significant" concern) comes from a
 * different rule, not this one: a number is only ever freed by a soft-delete,
 * and `deleteInvoice` refuses anything that ever left `draft`. So a number
 * that was genuinely issued can never be recycled here.
 */
async function generateNumber(companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  let seq = (await repository.countAllInvoices(companyId)) + 1;

  for (let attempt = 0; attempt < 1000; attempt++) {
    const number = `INV-${year}-${String(seq).padStart(4, '0')}`;
    if (!(await repository.isNumberTaken(companyId, number))) return number;
    seq++;
  }

  throw new Error('Could not allocate an invoice number');
}

function toItemsWrite(items: InvoiceLineItemInput[]): repository.InvoiceItemWrite[] {
  return items.map((item, index) => ({
    ...item,
    lineTotal: computeLineTotals(item).lineTotal,
    position: index,
  }));
}

async function assertLinks(companyId: string, input: InvoiceInput): Promise<void> {
  await assertClientInCompany(companyId, input.clientId);
  await assertContactOnClient(companyId, input.clientId, input.contactId);
  await assertProjectInCompany(companyId, input.projectId);
}

export async function listInvoices(companyId: string, query: repository.ListInvoicesQuery) {
  return repository.listInvoices(companyId, query);
}

export async function getInvoice(companyId: string, id: string) {
  const found = await repository.findById(companyId, id);

  if (!found) throw new NotFoundError('Invoice not found.');

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
  input: InvoiceInput,
  source: { quoteId: string | null; proformaInvoiceId: string | null },
) {
  await assertLinks(companyId, input);

  const { items, ...header } = input;
  const number = await generateNumber(companyId);
  const totals = computeDocumentTotals(items);

  const created = await repository.create(
    companyId,
    { ...header, ...totals, number, createdById: actorUserId, ...source },
    toItemsWrite(items),
  );

  logger.info('Invoice created', { companyId, invoiceId: created.id, number, ...source });

  return created;
}

export async function createInvoice(companyId: string, actorUserId: string, input: InvoiceInput) {
  return createInternal(companyId, actorUserId, input, { quoteId: null, proformaInvoiceId: null });
}

/** Copies a quote's client/contact/project/currency/notes/terms/items. No reciprocal mark on the quote. */
export async function createInvoiceFromQuote(
  companyId: string,
  actorUserId: string,
  quoteId: string,
  dueDate: Date,
) {
  const quote = await quotesService.getQuote(companyId, quoteId);

  const input: InvoiceInput = {
    clientId: quote.clientId,
    contactId: quote.contactId,
    projectId: quote.projectId,
    title: quote.title,
    issueDate: new Date(),
    dueDate,
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

  return createInternal(companyId, actorUserId, input, { quoteId, proformaInvoiceId: null });
}

/**
 * Copies a proforma's fields and, once the invoice genuinely exists, marks
 * the proforma converted. That call happens **after** the insert and is
 * best-effort: if it fails, the invoice — the real, legally significant
 * record — still exists, and a proforma stuck one status behind is a minor,
 * recoverable inconsistency. The reverse order (mark first, insert second)
 * would risk the opposite: a "converted" proforma with no invoice behind it.
 */
export async function createInvoiceFromProforma(
  companyId: string,
  actorUserId: string,
  proformaInvoiceId: string,
  dueDate: Date,
) {
  const proforma = await proformasService.getProforma(companyId, proformaInvoiceId);

  const input: InvoiceInput = {
    clientId: proforma.clientId,
    contactId: proforma.contactId,
    projectId: proforma.projectId,
    title: proforma.title,
    issueDate: new Date(),
    dueDate,
    currency: proforma.currency,
    notes: proforma.notes,
    terms: proforma.terms,
    items: proforma.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      taxRate: item.taxRate,
    })),
  };

  const created = await createInternal(companyId, actorUserId, input, {
    quoteId: null,
    proformaInvoiceId,
  });

  try {
    await proformasService.markConverted(companyId, proformaInvoiceId);
  } catch (error) {
    logger.error('Invoice created but the source proforma could not be marked converted', {
      companyId,
      invoiceId: created.id,
      proformaInvoiceId,
      error,
    });
  }

  return created;
}

/** A draft-only edit — see the module note on why content locks once sent. */
export async function updateInvoice(companyId: string, id: string, input: InvoiceInput) {
  const existing = await getInvoice(companyId, id);

  if (existing.status !== 'draft') {
    throw new ConflictError('Only a draft invoice can be edited.');
  }

  await assertLinks(companyId, input);

  const { items, ...header } = input;
  const totals = computeDocumentTotals(items);

  const updated = await repository.update(companyId, id, { ...header, ...totals }, toItemsWrite(items));

  if (!updated) throw new NotFoundError('Invoice not found.');

  logger.info('Invoice updated', { companyId, invoiceId: id });

  return updated;
}

/** The one-click "send" action — only a draft can be sent. */
export async function sendInvoice(companyId: string, id: string) {
  const existing = await getInvoice(companyId, id);

  if (existing.status !== 'draft') {
    throw new ConflictError('Only a draft invoice can be sent.');
  }

  const updated = await repository.updateStatus(companyId, id, { status: 'sent', sentAt: new Date() });

  if (!updated) throw new NotFoundError('Invoice not found.');

  logger.info('Invoice sent', { companyId, invoiceId: id });

  return updated;
}

/**
 * Voids an issued invoice — the correct way to reverse it once sent. Refused
 * from `draft` (cancel it instead, no number was ever exposed to a client),
 * from `paid` (a real refund/credit process, out of scope), and from an
 * already-terminal `cancelled`/`void`.
 */
export async function voidInvoice(companyId: string, id: string) {
  const existing = await getInvoice(companyId, id);

  if (!['sent', 'partially_paid', 'overdue'].includes(existing.status)) {
    throw new ConflictError('Only a sent, partially paid, or overdue invoice can be voided.');
  }

  const updated = await repository.updateStatus(companyId, id, { status: 'void', voidedAt: new Date() });

  if (!updated) throw new NotFoundError('Invoice not found.');

  logger.info('Invoice voided', { companyId, invoiceId: id });

  return updated;
}

/** Abandons a draft without deleting it — keeps the row for reference, frees nothing to reuse. */
export async function cancelInvoice(companyId: string, id: string) {
  const existing = await getInvoice(companyId, id);

  if (existing.status !== 'draft') {
    throw new ConflictError('Only a draft invoice can be cancelled. Void a sent invoice instead.');
  }

  const updated = await repository.updateStatus(companyId, id, { status: 'cancelled' });

  if (!updated) throw new NotFoundError('Invoice not found.');

  logger.info('Invoice cancelled', { companyId, invoiceId: id });

  return updated;
}

/**
 * Deletion is refused for anything that ever left `draft` — that is the rule
 * that keeps an issued number from ever being recycled (see `generateNumber`).
 */
export async function deleteInvoice(companyId: string, id: string) {
  const existing = await getInvoice(companyId, id);

  if (existing.status !== 'draft' && existing.status !== 'cancelled') {
    throw new ConflictError('A sent invoice cannot be deleted. Void it instead.');
  }

  const deleted = await repository.softDelete(companyId, id);

  if (!deleted) throw new NotFoundError('Invoice not found.');

  logger.info('Invoice deleted', { companyId, invoiceId: id });

  return deleted;
}

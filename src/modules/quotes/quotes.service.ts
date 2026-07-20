import 'server-only';

import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { computeDocumentTotals, computeLineTotals } from '@/lib/money';

import * as repository from './quotes.repository';
import type { QuoteInput, QuoteLineItemInput, QuoteStatus } from './quotes.validation';

/**
 * Quote rules: number generation, tenant guards on every linked record, derived
 * status timestamps, and turning line items into stored totals via exact
 * decimal math (never floats — see `@/lib/money`).
 */

export type { QuoteListItem, QuoteWithItems, ListQuotesQuery } from './quotes.repository';

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

async function assertOpportunityInCompany(companyId: string, opportunityId: string | null): Promise<void> {
  if (!opportunityId) return;
  if (!(await repository.opportunityBelongsToCompany(companyId, opportunityId))) {
    throw new ValidationError('That opportunity does not exist in this workspace.');
  }
}

async function assertProjectInCompany(companyId: string, projectId: string | null): Promise<void> {
  if (!projectId) return;
  if (!(await repository.projectBelongsToCompany(companyId, projectId))) {
    throw new ValidationError('That project does not exist in this workspace.');
  }
}

/**
 * Next free quote number, `QUO-{year}-{seq}`. Same seed-then-walk approach as
 * a project's `code` — the partial unique index is the real guarantee, this
 * just picks a friendly number.
 */
async function generateNumber(companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  let seq = (await repository.countAllQuotes(companyId)) + 1;

  for (let attempt = 0; attempt < 1000; attempt++) {
    const number = `QUO-${year}-${String(seq).padStart(4, '0')}`;
    if (!(await repository.isNumberTaken(companyId, number))) return number;
    seq++;
  }

  throw new Error('Could not allocate a quote number');
}

/**
 * Each timestamp is set on first entry to its status and cleared on leaving
 * it — the same shape as an opportunity's `closedAt`. A quote can move
 * sent → rejected → draft (a revision) and back, and each marker reflects
 * only whether the quote is *currently* in that state.
 */
function deriveSentAt(status: QuoteStatus, existing: Date | null): Date | null {
  return status === 'draft' ? null : (existing ?? new Date());
}

function deriveAcceptedAt(status: QuoteStatus, existing: Date | null): Date | null {
  return status === 'accepted' ? (existing ?? new Date()) : null;
}

function deriveRejectedAt(status: QuoteStatus, existing: Date | null): Date | null {
  return status === 'rejected' ? (existing ?? new Date()) : null;
}

function toItemsWrite(items: QuoteLineItemInput[]): repository.QuoteItemWrite[] {
  return items.map((item, index) => ({
    ...item,
    lineTotal: computeLineTotals(item).lineTotal,
    position: index,
  }));
}

async function assertLinks(companyId: string, input: QuoteInput): Promise<void> {
  await assertClientInCompany(companyId, input.clientId);
  await assertContactOnClient(companyId, input.clientId, input.contactId);
  await assertOpportunityInCompany(companyId, input.opportunityId);
  await assertProjectInCompany(companyId, input.projectId);
}

export async function listQuotes(companyId: string, query: repository.ListQuotesQuery) {
  return repository.listQuotes(companyId, query);
}

export async function getQuote(companyId: string, id: string) {
  const found = await repository.findById(companyId, id);

  if (!found) throw new NotFoundError('Quote not found.');

  return found;
}

export async function listClientOptions(companyId: string) {
  return repository.listClientOptions(companyId);
}

export async function listOpportunityOptions(companyId: string) {
  return repository.listOpportunityOptions(companyId);
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

export async function createQuote(companyId: string, actorUserId: string, input: QuoteInput) {
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
      createdById: actorUserId,
      sentAt: deriveSentAt(header.status, null),
      acceptedAt: deriveAcceptedAt(header.status, null),
      rejectedAt: deriveRejectedAt(header.status, null),
    },
    toItemsWrite(items),
  );

  logger.info('Quote created', { companyId, quoteId: created.id, number });

  return created;
}

export async function updateQuote(companyId: string, id: string, input: QuoteInput) {
  const existing = await getQuote(companyId, id);

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
      acceptedAt: deriveAcceptedAt(header.status, existing.acceptedAt),
      rejectedAt: deriveRejectedAt(header.status, existing.rejectedAt),
    },
    toItemsWrite(items),
  );

  if (!updated) throw new NotFoundError('Quote not found.');

  logger.info('Quote updated', { companyId, quoteId: id });

  return updated;
}

/** The one-click "send" action, distinct from a general status edit — only a draft can be sent. */
export async function sendQuote(companyId: string, id: string) {
  const existing = await getQuote(companyId, id);

  if (existing.status !== 'draft') {
    throw new ConflictError('Only a draft quote can be sent.');
  }

  const updated = await repository.updateStatus(companyId, id, {
    status: 'sent',
    sentAt: new Date(),
    acceptedAt: null,
    rejectedAt: null,
  });

  if (!updated) throw new NotFoundError('Quote not found.');

  logger.info('Quote sent', { companyId, quoteId: id });

  return updated;
}

export async function deleteQuote(companyId: string, id: string) {
  const deleted = await repository.softDelete(companyId, id);

  if (!deleted) throw new NotFoundError('Quote not found.');

  logger.info('Quote deleted', { companyId, quoteId: id });

  return deleted;
}

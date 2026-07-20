import 'server-only';

import { NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';

import * as repository from './opportunities.repository';
import { CLOSED_STAGES, type OpportunityInput, type OpportunityStage } from './opportunities.validation';

/**
 * Opportunity rules.
 *
 * Two things live here that are policy, not SQL: `closedAt` is derived from the
 * stage (a deal is closed exactly when it is won or lost), and the client an
 * opportunity attaches to must belong to this tenant.
 */

export type { OpportunityListItem, ListOpportunitiesQuery } from './opportunities.repository';

/**
 * A deal is closed exactly when it is won or lost.
 *
 * The original close date is preserved on later edits — editing the name of a
 * deal that was won last week must not reset when it closed. Moving back to an
 * open stage clears it: the deal is live again.
 */
function deriveClosedAt(stage: OpportunityStage, existingClosedAt: Date | null): Date | null {
  if (CLOSED_STAGES.includes(stage)) return existingClosedAt ?? new Date();
  return null;
}

async function assertClientInCompany(companyId: string, clientId: string): Promise<void> {
  if (!(await repository.clientBelongsToCompany(companyId, clientId))) {
    throw new ValidationError('That client does not exist in this workspace.');
  }
}

/** A linked contact must belong to the very client the opportunity is on, not just the company. */
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

export async function listOpportunities(companyId: string, query: repository.ListOpportunitiesQuery) {
  return repository.listOpportunities(companyId, query);
}

export async function getOpportunity(companyId: string, id: string) {
  const found = await repository.findById(companyId, id);

  if (!found) throw new NotFoundError('Opportunity not found.');

  return found;
}

export async function listClientOptions(companyId: string) {
  return repository.listClientOptions(companyId);
}

/** Contacts grouped by client id, for the form's client-dependent contact picker. */
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

export async function listOwnerOptions(companyId: string) {
  return repository.listOwnerOptions(companyId);
}

export async function createOpportunity(companyId: string, input: OpportunityInput) {
  await assertClientInCompany(companyId, input.clientId);
  await assertContactOnClient(companyId, input.clientId, input.contactId);

  const created = await repository.create(companyId, {
    ...input,
    closedAt: deriveClosedAt(input.stage, null),
  });

  logger.info('Opportunity created', { companyId, opportunityId: created.id });

  return created;
}

export async function updateOpportunity(companyId: string, id: string, input: OpportunityInput) {
  const existing = await getOpportunity(companyId, id);

  await assertClientInCompany(companyId, input.clientId);
  await assertContactOnClient(companyId, input.clientId, input.contactId);

  const updated = await repository.update(companyId, id, {
    ...input,
    closedAt: deriveClosedAt(input.stage, existing.closedAt),
  });

  if (!updated) throw new NotFoundError('Opportunity not found.');

  logger.info('Opportunity updated', { companyId, opportunityId: id });

  return updated;
}

export async function deleteOpportunity(companyId: string, id: string) {
  const deleted = await repository.softDelete(companyId, id);

  if (!deleted) throw new NotFoundError('Opportunity not found.');

  logger.info('Opportunity deleted', { companyId, opportunityId: id });

  return deleted;
}

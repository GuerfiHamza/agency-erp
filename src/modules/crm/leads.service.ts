import 'server-only';

import { ConflictError, NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';

import * as repository from './leads.repository';
import type { LeadInput } from './leads.validation';

/**
 * Lead rules.
 *
 * Thin like clients — tenant scoping lives in the repository. The one piece of
 * real policy is conversion: it is single-use, and "already converted" is a
 * conflict, not a not-found.
 */

export type { LeadListItem, ListLeadsQuery } from './leads.repository';

export async function listLeads(companyId: string, query: repository.ListLeadsQuery) {
  return repository.listLeads(companyId, query);
}

export async function getLead(companyId: string, leadId: string) {
  const found = await repository.findById(companyId, leadId);

  if (!found) throw new NotFoundError('Lead not found.');

  return found;
}

export async function listOwnerOptions(companyId: string) {
  return repository.listOwnerOptions(companyId);
}

export async function createLead(companyId: string, input: LeadInput) {
  const created = await repository.create(companyId, input);

  logger.info('Lead created', { companyId, leadId: created.id });

  return created;
}

export async function updateLead(companyId: string, leadId: string, input: LeadInput) {
  const updated = await repository.update(companyId, leadId, input);

  if (!updated) throw new NotFoundError('Lead not found.');

  logger.info('Lead updated', { companyId, leadId });

  return updated;
}

export async function deleteLead(companyId: string, leadId: string) {
  const deleted = await repository.softDelete(companyId, leadId);

  if (!deleted) throw new NotFoundError('Lead not found.');

  logger.info('Lead deleted', { companyId, leadId });

  return deleted;
}

/**
 * Convert a lead to a client.
 *
 * `null` from the repository means either the lead is gone or it is already
 * converted. Distinguish so the caller sees the right message: a re-read tells
 * the two apart without another race.
 */
export async function convertLead(companyId: string, leadId: string) {
  const result = await repository.convert(companyId, leadId);

  if (!result) {
    const existing = await repository.findById(companyId, leadId);
    if (!existing) throw new NotFoundError('Lead not found.');
    throw new ConflictError('This lead has already been converted to a client.');
  }

  logger.info('Lead converted', { companyId, leadId, clientId: result.clientId });

  return result;
}

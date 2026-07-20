import 'server-only';

import { NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';

import * as repository from './clients.repository';
import type { ClientInput } from './clients.validation';

/**
 * Client rules.
 *
 * Thin by design: a client is a plain record with no cross-tenant invariants
 * like the last-owner rule that guards users. Tenant scoping lives in the
 * repository (every query takes `companyId`); this layer adds the "missing reads
 * as an error" contract and the audit log.
 */

export type { ClientExportRow, ClientListItem } from './clients.repository';
export type { ListClientsQuery } from './clients.repository';

export async function listClients(companyId: string, query: repository.ListClientsQuery) {
  return repository.listClients(companyId, query);
}

export async function getClient(companyId: string, clientId: string) {
  const found = await repository.findById(companyId, clientId);

  if (!found) throw new NotFoundError('Client not found.');

  return found;
}

export async function listOwnerOptions(companyId: string) {
  return repository.listOwnerOptions(companyId);
}

export async function createClient(companyId: string, input: ClientInput) {
  const created = await repository.create(companyId, input);

  logger.info('Client created', { companyId, clientId: created.id });

  return created;
}

export async function updateClient(companyId: string, clientId: string, input: ClientInput) {
  const updated = await repository.update(companyId, clientId, input);

  if (!updated) throw new NotFoundError('Client not found.');

  logger.info('Client updated', { companyId, clientId });

  return updated;
}

export async function deleteClient(companyId: string, clientId: string) {
  const deleted = await repository.softDelete(companyId, clientId);

  if (!deleted) throw new NotFoundError('Client not found.');

  logger.info('Client deleted', { companyId, clientId });

  return deleted;
}

export async function exportClients(companyId: string, query: Parameters<typeof repository.exportRows>[1]) {
  return repository.exportRows(companyId, query);
}

import 'server-only';

import { NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';

import * as repository from './contacts.repository';
import type { ContactInput } from './contacts.validation';

/**
 * Contact rules.
 *
 * The client a contact belongs to must be this tenant's; the "one primary per
 * client" reconciliation lives in the repository transaction, next to the unique
 * index it protects.
 */

export type { ContactListItem, ListContactsQuery } from './contacts.repository';

async function assertClientInCompany(companyId: string, clientId: string): Promise<void> {
  if (!(await repository.clientBelongsToCompany(companyId, clientId))) {
    throw new ValidationError('That client does not exist in this workspace.');
  }
}

export async function listContacts(companyId: string, query: repository.ListContactsQuery) {
  return repository.listContacts(companyId, query);
}

export async function getContact(companyId: string, id: string) {
  const found = await repository.findById(companyId, id);

  if (!found) throw new NotFoundError('Contact not found.');

  return found;
}

export async function listClientOptions(companyId: string) {
  return repository.listClientOptions(companyId);
}

export async function createContact(companyId: string, input: ContactInput) {
  await assertClientInCompany(companyId, input.clientId);

  const created = await repository.create(companyId, input);

  logger.info('Contact created', { companyId, contactId: created.id });

  return created;
}

export async function updateContact(companyId: string, id: string, input: ContactInput) {
  await getContact(companyId, id);
  await assertClientInCompany(companyId, input.clientId);

  const updated = await repository.update(companyId, id, input);

  if (!updated) throw new NotFoundError('Contact not found.');

  logger.info('Contact updated', { companyId, contactId: id });

  return updated;
}

export async function deleteContact(companyId: string, id: string) {
  const deleted = await repository.softDelete(companyId, id);

  if (!deleted) throw new NotFoundError('Contact not found.');

  logger.info('Contact deleted', { companyId, contactId: id });

  return deleted;
}

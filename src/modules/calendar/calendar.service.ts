import 'server-only';

import { NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';

import * as repository from './calendar.repository';
import type { EventInput, EventLinkKind } from './calendar.validation';

/**
 * Calendar rules.
 *
 * The link pair is resolved into exactly one foreign key and the target must
 * belong to this tenant. The end-after-start rule lives in Zod rather than here
 * — it is a property of the input, not of the tenant, so both the form and the
 * action get it from the same schema.
 */

export type { EventListItem } from './calendar.repository';

const NO_LINK: repository.LinkColumns = { clientId: null, projectId: null, taskId: null };

async function resolveLink(
  companyId: string,
  kind: EventLinkKind,
  id: string | null,
): Promise<repository.LinkColumns> {
  if (kind === 'none' || !id) return NO_LINK;

  if (!(await repository.linkExists(companyId, kind, id))) {
    throw new ValidationError('The linked record does not exist in this workspace.');
  }

  return {
    clientId: kind === 'client' ? id : null,
    projectId: kind === 'project' ? id : null,
    taskId: kind === 'task' ? id : null,
  };
}

function toWrite(input: EventInput) {
  return {
    title: input.title,
    description: input.description,
    location: input.location,
    type: input.type,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    isAllDay: input.isAllDay,
  };
}

export async function listEventsInRange(companyId: string, from: Date, to: Date) {
  return repository.listEventsInRange(companyId, from, to);
}

export async function getEvent(companyId: string, id: string) {
  const found = await repository.findById(companyId, id);

  if (!found) throw new NotFoundError('Event not found.');

  return found;
}

export async function listLinkOptions(companyId: string) {
  const [clients, projects, tasks] = await Promise.all([
    repository.listClientOptions(companyId),
    repository.listProjectOptions(companyId),
    repository.listTaskOptions(companyId),
  ]);

  return { clients, projects, tasks };
}

export async function createEvent(companyId: string, actorUserId: string, input: EventInput) {
  const link = await resolveLink(companyId, input.linkKind, input.linkId);

  const created = await repository.create(companyId, {
    ...toWrite(input),
    createdById: actorUserId,
    ...link,
  });

  logger.info('Calendar event created', { companyId, eventId: created.id });

  return created;
}

/** Editing someone else's event never re-attributes it — `createdById` is untouched. */
export async function updateEvent(companyId: string, id: string, input: EventInput) {
  await getEvent(companyId, id);

  const link = await resolveLink(companyId, input.linkKind, input.linkId);

  const updated = await repository.update(companyId, id, { ...toWrite(input), ...link });

  if (!updated) throw new NotFoundError('Event not found.');

  logger.info('Calendar event updated', { companyId, eventId: id });

  return updated;
}

export async function deleteEvent(companyId: string, id: string) {
  const deleted = await repository.softDelete(companyId, id);

  if (!deleted) throw new NotFoundError('Event not found.');

  logger.info('Calendar event deleted', { companyId, eventId: id });

  return deleted;
}

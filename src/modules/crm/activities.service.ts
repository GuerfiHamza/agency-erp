import 'server-only';

import { NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';

import * as repository from './activities.repository';
import type { ActivityInput, RelatedKind } from './activities.validation';

/**
 * Activity rules.
 *
 * The policy here is the link: the form's `relatedKind` + `relatedId` pair is
 * resolved into exactly one foreign key, and the target must belong to this
 * tenant. The author (`createdById`) is the actor on create and is preserved on
 * edit — editing someone's logged call must not reassign who made it.
 */

export type { ActivityListItem, ListActivitiesQuery } from './activities.repository';

interface RelatedColumns {
  leadId: string | null;
  clientId: string | null;
  opportunityId: string | null;
}

const NO_LINK: RelatedColumns = { leadId: null, clientId: null, opportunityId: null };

async function resolveRelated(
  companyId: string,
  kind: RelatedKind,
  id: string | null,
): Promise<RelatedColumns> {
  if (kind === 'none' || !id) return NO_LINK;

  if (!(await repository.relatedExists(companyId, kind, id))) {
    throw new ValidationError('The linked record does not exist in this workspace.');
  }

  return {
    leadId: kind === 'lead' ? id : null,
    clientId: kind === 'client' ? id : null,
    opportunityId: kind === 'opportunity' ? id : null,
  };
}

export async function listActivities(companyId: string, query: repository.ListActivitiesQuery) {
  return repository.listActivities(companyId, query);
}

export async function getActivity(companyId: string, id: string) {
  const found = await repository.findById(companyId, id);

  if (!found) throw new NotFoundError('Activity not found.');

  return found;
}

export async function listLinkOptions(companyId: string) {
  const [leads, clients, opportunities] = await Promise.all([
    repository.listLeadOptions(companyId),
    repository.listClientOptions(companyId),
    repository.listOpportunityOptions(companyId),
  ]);

  return { leads, clients, opportunities };
}

export async function createActivity(companyId: string, actorUserId: string, input: ActivityInput) {
  const related = await resolveRelated(companyId, input.relatedKind, input.relatedId);

  const created = await repository.create(companyId, {
    type: input.type,
    subject: input.subject,
    body: input.body,
    occurredAt: input.occurredAt,
    createdById: actorUserId,
    ...related,
  });

  logger.info('Activity created', { companyId, activityId: created.id });

  return created;
}

export async function updateActivity(companyId: string, id: string, input: ActivityInput) {
  const existing = await getActivity(companyId, id);

  const related = await resolveRelated(companyId, input.relatedKind, input.relatedId);

  const updated = await repository.update(companyId, id, {
    type: input.type,
    subject: input.subject,
    body: input.body,
    occurredAt: input.occurredAt,
    // Preserve the original author; an edit is not a re-attribution.
    createdById: existing.createdById,
    ...related,
  });

  if (!updated) throw new NotFoundError('Activity not found.');

  logger.info('Activity updated', { companyId, activityId: id });

  return updated;
}

export async function deleteActivity(companyId: string, id: string) {
  const deleted = await repository.softDelete(companyId, id);

  if (!deleted) throw new NotFoundError('Activity not found.');

  logger.info('Activity deleted', { companyId, activityId: id });

  return deleted;
}

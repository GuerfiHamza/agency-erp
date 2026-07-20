import 'server-only';

import { NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';

import * as repository from './projects.repository';
import { COMPLETED_STATUS, type ProjectInput, type ProjectStatus } from './projects.validation';

/**
 * Project rules.
 *
 * Three pieces of policy live here: the human-facing `code` is generated and
 * kept unique per company, `completedAt` is derived from the status, and a
 * project's client (when it has one) must belong to this tenant.
 */

export type { ProjectListItem, ListProjectsQuery } from './projects.repository';

/**
 * A project is complete exactly when its status is `completed`.
 *
 * The original completion date survives later edits; moving back to an active
 * status clears it. Same shape as the opportunity `closedAt` rule.
 */
function deriveCompletedAt(status: ProjectStatus, existingCompletedAt: Date | null): Date | null {
  if (status === COMPLETED_STATUS) return existingCompletedAt ?? new Date();
  return null;
}

/**
 * Next free project code, `PRJ-{year}-{seq}`.
 *
 * Seeds the sequence from the company's total project count so the first probe
 * almost always lands, then walks forward past any taken code. The partial
 * unique index is the real guarantee; this just picks a friendly number.
 *
 * ponytail: seq is company-global, not per-year, and two concurrent creates
 * could still collide on the index (the create then fails). Add a numbered
 * sequence table only if project creation ever becomes genuinely concurrent.
 */
async function generateCode(companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  let seq = (await repository.countAllProjects(companyId)) + 1;

  // Bounded walk: even a heavily-deleted company will not loop far.
  for (let attempt = 0; attempt < 1000; attempt++) {
    const code = `PRJ-${year}-${String(seq).padStart(3, '0')}`;
    if (!(await repository.isCodeTaken(companyId, code))) return code;
    seq++;
  }

  throw new Error('Could not allocate a project code');
}

async function assertClientInCompany(companyId: string, clientId: string | null): Promise<void> {
  if (!clientId) return;
  if (!(await repository.clientBelongsToCompany(companyId, clientId))) {
    throw new ValidationError('That client does not exist in this workspace.');
  }
}

export async function listProjects(companyId: string, query: repository.ListProjectsQuery) {
  return repository.listProjects(companyId, query);
}

export async function getProject(companyId: string, id: string) {
  const found = await repository.findById(companyId, id);

  if (!found) throw new NotFoundError('Project not found.');

  return found;
}

export async function listClientOptions(companyId: string) {
  return repository.listClientOptions(companyId);
}

export async function listManagerOptions(companyId: string) {
  return repository.listManagerOptions(companyId);
}

export async function createProject(companyId: string, input: ProjectInput) {
  await assertClientInCompany(companyId, input.clientId);

  const code = await generateCode(companyId);

  const created = await repository.create(companyId, {
    ...input,
    code,
    completedAt: deriveCompletedAt(input.status, null),
  });

  logger.info('Project created', { companyId, projectId: created.id, code });

  return created;
}

export async function updateProject(companyId: string, id: string, input: ProjectInput) {
  const existing = await getProject(companyId, id);

  await assertClientInCompany(companyId, input.clientId);

  const updated = await repository.update(companyId, id, {
    ...input,
    completedAt: deriveCompletedAt(input.status, existing.completedAt),
  });

  if (!updated) throw new NotFoundError('Project not found.');

  logger.info('Project updated', { companyId, projectId: id });

  return updated;
}

export async function deleteProject(companyId: string, id: string) {
  const deleted = await repository.softDelete(companyId, id);

  if (!deleted) throw new NotFoundError('Project not found.');

  logger.info('Project deleted', { companyId, projectId: id });

  return deleted;
}

import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { clientEnv } from '@/config/env';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { findAvailableSlug, toSlug } from '@/lib/slug';
import * as companiesRepository from '@/modules/companies/companies.repository';
import { getCompanySetting, upsertCompanySetting } from '@/modules/settings/settings.repository';

import * as repository from './portfolio.repository';
import type { ProjectInput } from './portfolio.validation';

/**
 * Portfolio rules.
 *
 * Non-derivable decisions:
 *  - a project's `slug` is generated once at creation and never changes — the
 *    public API and neodott.com address a project by it, so a rename must not
 *    move the URL out from under an already-published link;
 *  - every image key (main or gallery) must sit under this company's
 *    `portfolio/` prefix — the same `assertOwnStorageKey` guard Documents
 *    uses, narrowed further to one scope so this module can never be handed a
 *    key for some other tenant object (a receipt, a contract) and serve it
 *    publicly by accident;
 *  - the API key is stored as a SHA-256 hash via the generic `settings`
 *    table (key `portfolio.apiKeyHash`), the same "never store the plaintext
 *    a database leak would turn into a working credential" posture as an
 *    invitation token. It is shown once, at generation time, and never again.
 */

export type {
  ProjectListItem,
  ListProjectsQuery,
  TechnologyRef,
  ProjectImageRow,
} from './portfolio.repository';

/** A project row as the list (and the edit dialog) needs it — technologies and gallery images included. */
export type PortfolioProjectRow = repository.ProjectListItem & {
  technologies: repository.TechnologyRef[];
  images: repository.ProjectImageRow[];
};

const IMAGE_SCOPE = 'portfolio';
const API_KEY_SETTING = 'portfolio.apiKeyHash';

// ---- Storage key guard ----

/**
 * `buildStorageKey` shapes every key as `${companyId}/${scope}/...`. Requiring
 * both the company prefix *and* the `portfolio` scope segment means a key for
 * some other object (a document, a receipt) can never be saved here and later
 * served by the public, unauthenticated image route.
 */
function assertOwnPortfolioImageKey(companyId: string, storageKey: string): void {
  if (!storageKey.startsWith(`${companyId}/${IMAGE_SCOPE}/`)) {
    logger.warn('Rejected non-portfolio storage key', { companyId, storageKey });
    throw new ValidationError('That image could not be found. Please upload it again.');
  }
}

// ---- Technologies & categories ----

async function generateCatalogueSlug(
  isTaken: (candidate: string) => Promise<boolean>,
  name: string,
): Promise<string> {
  return findAvailableSlug(toSlug(name, 'technology'), isTaken);
}

export async function listTechnologies(companyId: string) {
  return repository.listTechnologies(companyId);
}

export async function createTechnology(companyId: string, name: string) {
  const slug = await generateCatalogueSlug(
    (candidate) => repository.isTechnologySlugTaken(companyId, candidate),
    name,
  );
  const created = await repository.createTechnology(companyId, name, slug);

  logger.info('Portfolio technology created', { companyId, technologyId: created.id });
  return created;
}

export async function updateTechnology(companyId: string, id: string, name: string) {
  const updated = await repository.updateTechnology(companyId, id, name);
  if (!updated) throw new NotFoundError('Technology not found.');
  return updated;
}

export async function deleteTechnology(companyId: string, id: string) {
  const deleted = await repository.softDeleteTechnology(companyId, id);
  if (!deleted) throw new NotFoundError('Technology not found.');
  return deleted;
}

export async function listCategories(companyId: string) {
  return repository.listCategories(companyId);
}

export async function createCategory(companyId: string, name: string) {
  const slug = await generateCatalogueSlug(
    (candidate) => repository.isCategorySlugTaken(companyId, candidate),
    name,
  );
  const created = await repository.createCategory(companyId, name, slug);

  logger.info('Portfolio category created', { companyId, categoryId: created.id });
  return created;
}

export async function updateCategory(companyId: string, id: string, name: string) {
  const updated = await repository.updateCategory(companyId, id, name);
  if (!updated) throw new NotFoundError('Category not found.');
  return updated;
}

export async function deleteCategory(companyId: string, id: string) {
  const deleted = await repository.softDeleteCategory(companyId, id);
  if (!deleted) throw new NotFoundError('Category not found.');
  return deleted;
}

// ---- Projects ----

async function generateProjectSlug(companyId: string, title: string): Promise<string> {
  return findAvailableSlug(toSlug(title, 'project'), (candidate) =>
    repository.isProjectSlugTaken(companyId, candidate),
  );
}

async function assertCategoryInCompany(companyId: string, categoryId: string | null): Promise<void> {
  if (!categoryId) return;
  if (!(await repository.categoryBelongsToCompany(companyId, categoryId))) {
    throw new ValidationError('That category does not exist in this workspace.');
  }
}

async function assertTechnologiesInCompany(companyId: string, technologyIds: string[]): Promise<void> {
  if (technologyIds.length === 0) return;

  const uniqueIds = [...new Set(technologyIds)];
  const found = await repository.countTechnologiesInCompany(companyId, uniqueIds);

  if (found !== uniqueIds.length) {
    throw new ValidationError('One or more technologies do not exist in this workspace.');
  }
}

async function withTechnologies(companyId: string, project: repository.ProjectListItem) {
  const technologies = await repository.listTechnologiesForProject(project.id);
  return { ...project, technologies };
}

export async function listProjects(companyId: string, query: repository.ListProjectsQuery) {
  const page = await repository.listProjects(companyId, query);
  const projectIds = page.items.map((item) => item.id);

  const [technologiesByProject, imagesByProject] = await Promise.all([
    repository.listTechnologiesForProjects(projectIds),
    repository.listImagesForProjects(projectIds),
  ]);

  return {
    ...page,
    items: page.items.map((item) => ({
      ...item,
      technologies: technologiesByProject.get(item.id) ?? [],
      images: imagesByProject.get(item.id) ?? [],
    })),
  };
}

export async function getProject(companyId: string, id: string) {
  const found = await repository.findById(companyId, id);
  if (!found) throw new NotFoundError('Project not found.');

  const [withTech, images] = await Promise.all([
    withTechnologies(companyId, found),
    repository.listProjectImages(id),
  ]);

  return { ...withTech, images };
}

export async function createProject(companyId: string, input: ProjectInput) {
  await assertCategoryInCompany(companyId, input.categoryId);
  await assertTechnologiesInCompany(companyId, input.technologyIds);

  if (input.mainImageKey) assertOwnPortfolioImageKey(companyId, input.mainImageKey);

  const slug = await generateProjectSlug(companyId, input.title);

  const created = await repository.create(companyId, {
    title: input.title,
    slug,
    shortDescription: input.shortDescription,
    aboutDescription: input.aboutDescription,
    categoryId: input.categoryId,
    mainImageKey: input.mainImageKey,
    websiteUrl: input.websiteUrl,
    isLive: input.isLive,
    status: input.status,
  });

  await repository.setProjectTechnologies(created.id, input.technologyIds);

  logger.info('Portfolio project created', { companyId, projectId: created.id, slug });

  return created;
}

export async function updateProject(companyId: string, id: string, input: ProjectInput) {
  await getProject(companyId, id);
  await assertCategoryInCompany(companyId, input.categoryId);
  await assertTechnologiesInCompany(companyId, input.technologyIds);

  if (input.mainImageKey) assertOwnPortfolioImageKey(companyId, input.mainImageKey);

  const updated = await repository.update(companyId, id, {
    title: input.title,
    shortDescription: input.shortDescription,
    aboutDescription: input.aboutDescription,
    categoryId: input.categoryId,
    mainImageKey: input.mainImageKey,
    websiteUrl: input.websiteUrl,
    isLive: input.isLive,
    status: input.status,
  });

  if (!updated) throw new NotFoundError('Project not found.');

  await repository.setProjectTechnologies(id, input.technologyIds);

  logger.info('Portfolio project updated', { companyId, projectId: id });

  return updated;
}

export async function deleteProject(companyId: string, id: string) {
  const deleted = await repository.softDelete(companyId, id);
  if (!deleted) throw new NotFoundError('Project not found.');

  logger.info('Portfolio project deleted', { companyId, projectId: id });
  return deleted;
}

export async function addProjectImage(companyId: string, projectId: string, storageKey: string) {
  await getProject(companyId, projectId); // tenant + existence check
  assertOwnPortfolioImageKey(companyId, storageKey);

  const added = await repository.addProjectImage(projectId, storageKey);
  logger.info('Portfolio image added', { companyId, projectId, imageId: added.id });

  return added;
}

export async function removeProjectImage(companyId: string, projectId: string, imageId: string) {
  await getProject(companyId, projectId);

  const removed = await repository.removeProjectImage(projectId, imageId);
  if (!removed) throw new NotFoundError('Image not found.');

  logger.info('Portfolio image removed', { companyId, projectId, imageId });
}

// ---- Public-facing shape ----

/** Absolute, permanent URL for a stored image — see `StorageProvider.read`'s own comment for why this isn't a presigned URL. */
export function publicImageUrl(storageKey: string): string {
  const encoded = storageKey.split('/').map(encodeURIComponent).join('/');
  return `${clientEnv.NEXT_PUBLIC_APP_URL}/api/public/portfolio/images/${encoded}`;
}

function toPublicShape(
  project: repository.ProjectListItem,
  technologies: repository.TechnologyRef[],
  images: repository.ProjectImageRow[],
) {
  return {
    title: project.title,
    slug: project.slug,
    shortDescription: project.shortDescription,
    aboutDescription: project.aboutDescription,
    category: project.categoryName,
    technologies: technologies.map((technology) => ({ name: technology.name, slug: technology.slug })),
    mainImageUrl: project.mainImageKey ? publicImageUrl(project.mainImageKey) : null,
    images: images.map((image) => publicImageUrl(image.storageKey)),
    websiteUrl: project.isLive ? project.websiteUrl : null,
    isLive: project.isLive,
    publishedAt: project.createdAt.toISOString(),
  };
}

export async function listPublicProjects(companyId: string) {
  const projects = await repository.listPublishedProjects(companyId);
  const technologiesByProject = await repository.listTechnologiesForProjects(
    projects.map((project) => project.id),
  );
  const imagesByProject = await Promise.all(
    projects.map((project) => repository.listProjectImages(project.id)),
  );

  return projects.map((project, index) =>
    toPublicShape(project, technologiesByProject.get(project.id) ?? [], imagesByProject[index] ?? []),
  );
}

export async function getPublicProjectBySlug(companyId: string, slug: string) {
  const project = await repository.findPublishedBySlug(companyId, slug);
  if (!project) throw new NotFoundError('Project not found.');

  const [technologies, images] = await Promise.all([
    repository.listTechnologiesForProject(project.id),
    repository.listProjectImages(project.id),
  ]);

  return toPublicShape(project, technologies, images);
}

// ---- API key ----

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Single-tenant deployment (see MEMORY's "Single-tenant lockdown"): the
 * public API has no session and no per-request tenant identifier, so the
 * only company row *is* the tenant. A future multi-tenant version would need
 * the key itself to encode which company it belongs to; not needed here.
 */
export async function resolveSoleCompanyId(): Promise<string | null> {
  const company = await companiesRepository.findSoleCompany();
  return company?.id ?? null;
}

/** Mint a new key, store only its hash, and return the plaintext once — never persisted or logged. */
export async function regenerateApiKey(companyId: string): Promise<string> {
  const key = randomBytes(32).toString('base64url');
  await upsertCompanySetting(companyId, API_KEY_SETTING, { hash: hashApiKey(key) });

  logger.info('Portfolio API key regenerated', { companyId });
  return key;
}

export async function hasApiKey(companyId: string): Promise<boolean> {
  const value = await getCompanySetting(companyId, API_KEY_SETTING);
  return Boolean(value && typeof value === 'object' && 'hash' in value);
}

/** Constant-time compare against the stored hash, so response timing can't leak how close a guess was. */
export async function verifyApiKey(companyId: string, presentedKey: string): Promise<boolean> {
  const value = await getCompanySetting(companyId, API_KEY_SETTING);

  if (!value || typeof value !== 'object' || !('hash' in value) || typeof value.hash !== 'string') {
    return false;
  }

  const expected = Buffer.from(value.hash, 'utf8');
  const actual = Buffer.from(hashApiKey(presentedKey), 'utf8');

  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

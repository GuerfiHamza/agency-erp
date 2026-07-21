import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNull,
  or,
  type SQL,
} from 'drizzle-orm';

import { db } from '@/db';
import {
  portfolioCategories,
  portfolioProjectImages,
  portfolioProjects,
  portfolioProjectTechnologies,
  portfolioTechnologies,
} from '@/db/schema';
import { buildPaginatedResult, toOffset } from '@/lib/helpers';
import type { PaginatedResult, PaginationParams, SortDirection } from '@/types';

import type { PortfolioProjectStatus, PortfolioSortField } from './portfolio.validation';

/**
 * Portfolio data access. The only place in the module that touches Drizzle.
 *
 * Every query is scoped by `companyId` and filters `deleted_at IS NULL`, same
 * as every other module — even though this deployment is single-tenant (see
 * MEMORY's "Single-tenant lockdown"), scoping costs nothing here and keeps
 * this module consistent with the other twenty.
 */

// ---- Technologies & categories: identical shape, so one pair of helpers ----

type CatalogueTable = typeof portfolioTechnologies | typeof portfolioCategories;

function liveCatalogueRow(table: CatalogueTable, companyId: string) {
  return and(eq(table.companyId, companyId), isNull(table.deletedAt)) as SQL;
}

async function listCatalogue(table: CatalogueTable, companyId: string) {
  return db
    .select(getTableColumns(table))
    .from(table)
    .where(liveCatalogueRow(table, companyId))
    .orderBy(asc(table.name));
}

async function isCatalogueSlugTaken(
  table: CatalogueTable,
  companyId: string,
  slug: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.companyId, companyId), eq(table.slug, slug), isNull(table.deletedAt)))
    .limit(1);

  return Boolean(row);
}

async function createCatalogueRow(table: CatalogueTable, companyId: string, name: string, slug: string) {
  const [row] = await db.insert(table).values({ companyId, name, slug }).returning();

  if (!row) throw new Error('Catalogue insert returned no row');
  return row;
}

async function updateCatalogueRow(table: CatalogueTable, companyId: string, id: string, name: string) {
  const [row] = await db
    .update(table)
    .set({ name })
    .where(and(eq(table.id, id), liveCatalogueRow(table, companyId)))
    .returning();

  return row ?? null;
}

async function softDeleteCatalogueRow(table: CatalogueTable, companyId: string, id: string) {
  const [row] = await db
    .update(table)
    .set({ deletedAt: new Date() })
    .where(and(eq(table.id, id), liveCatalogueRow(table, companyId)))
    .returning();

  return row ?? null;
}

export const listTechnologies = (companyId: string) => listCatalogue(portfolioTechnologies, companyId);
export const isTechnologySlugTaken = (companyId: string, slug: string) =>
  isCatalogueSlugTaken(portfolioTechnologies, companyId, slug);
export const createTechnology = (companyId: string, name: string, slug: string) =>
  createCatalogueRow(portfolioTechnologies, companyId, name, slug);
export const updateTechnology = (companyId: string, id: string, name: string) =>
  updateCatalogueRow(portfolioTechnologies, companyId, id, name);
export const softDeleteTechnology = (companyId: string, id: string) =>
  softDeleteCatalogueRow(portfolioTechnologies, companyId, id);

export const listCategories = (companyId: string) => listCatalogue(portfolioCategories, companyId);
export const isCategorySlugTaken = (companyId: string, slug: string) =>
  isCatalogueSlugTaken(portfolioCategories, companyId, slug);
export const createCategory = (companyId: string, name: string, slug: string) =>
  createCatalogueRow(portfolioCategories, companyId, name, slug);
export const updateCategory = (companyId: string, id: string, name: string) =>
  updateCatalogueRow(portfolioCategories, companyId, id, name);
export const softDeleteCategory = (companyId: string, id: string) =>
  softDeleteCatalogueRow(portfolioCategories, companyId, id);

/** How many of these ids are live technologies belonging to this company. */
export async function countTechnologiesInCompany(companyId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;

  const [row] = await db
    .select({ value: count() })
    .from(portfolioTechnologies)
    .where(
      and(
        eq(portfolioTechnologies.companyId, companyId),
        inArray(portfolioTechnologies.id, ids),
        isNull(portfolioTechnologies.deletedAt),
      ),
    );

  return row?.value ?? 0;
}

export async function categoryBelongsToCompany(companyId: string, categoryId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: portfolioCategories.id })
    .from(portfolioCategories)
    .where(
      and(
        eq(portfolioCategories.id, categoryId),
        eq(portfolioCategories.companyId, companyId),
        isNull(portfolioCategories.deletedAt),
      ),
    )
    .limit(1);

  return Boolean(row);
}

// ---- Projects ----

export type ProjectRow = typeof portfolioProjects.$inferSelect;
export type ProjectListItem = ProjectRow & { categoryName: string | null };

const liveProject = (companyId: string) =>
  and(eq(portfolioProjects.companyId, companyId), isNull(portfolioProjects.deletedAt)) as SQL;

const SORT_COLUMNS = {
  title: portfolioProjects.title,
  status: portfolioProjects.status,
  createdAt: portfolioProjects.createdAt,
} as const;

export interface ListProjectsQuery extends PaginationParams {
  search?: string;
  sort?: { field: PortfolioSortField; direction: SortDirection };
  statuses?: PortfolioProjectStatus[];
}

const PROJECT_SELECTION = { ...getTableColumns(portfolioProjects), categoryName: portfolioCategories.name };

function buildProjectFilters(companyId: string, query: Pick<ListProjectsQuery, 'search' | 'statuses'>): SQL {
  const filters: SQL[] = [liveProject(companyId)];

  if (query.search) {
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    filters.push(or(ilike(portfolioProjects.title, term), ilike(portfolioProjects.slug, term)) as SQL);
  }

  if (query.statuses && query.statuses.length > 0) {
    filters.push(inArray(portfolioProjects.status, query.statuses));
  }

  return and(...filters) as SQL;
}

export async function listProjects(
  companyId: string,
  query: ListProjectsQuery,
): Promise<PaginatedResult<ProjectListItem>> {
  const where = buildProjectFilters(companyId, query);
  const sortColumn = SORT_COLUMNS[query.sort?.field ?? 'createdAt'];
  const direction = query.sort?.direction === 'asc' ? asc : desc;

  const [items, [total]] = await Promise.all([
    db
      .select(PROJECT_SELECTION)
      .from(portfolioProjects)
      .leftJoin(portfolioCategories, eq(portfolioCategories.id, portfolioProjects.categoryId))
      .where(where)
      .orderBy(direction(sortColumn), asc(portfolioProjects.id))
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db.select({ value: count() }).from(portfolioProjects).where(where),
  ]);

  return buildPaginatedResult(items, total?.value ?? 0, query);
}

export async function findById(companyId: string, id: string): Promise<ProjectListItem | null> {
  const [row] = await db
    .select(PROJECT_SELECTION)
    .from(portfolioProjects)
    .leftJoin(portfolioCategories, eq(portfolioCategories.id, portfolioProjects.categoryId))
    .where(and(eq(portfolioProjects.id, id), liveProject(companyId)))
    .limit(1);

  return row ?? null;
}

export async function isProjectSlugTaken(companyId: string, slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: portfolioProjects.id })
    .from(portfolioProjects)
    .where(
      and(
        eq(portfolioProjects.companyId, companyId),
        eq(portfolioProjects.slug, slug),
        isNull(portfolioProjects.deletedAt),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export type ProjectWrite = Omit<ProjectRow, 'id' | 'companyId' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export async function create(companyId: string, values: ProjectWrite): Promise<ProjectRow> {
  const [row] = await db
    .insert(portfolioProjects)
    .values({ ...values, companyId })
    .returning();

  if (!row) throw new Error('Portfolio project insert returned no row');
  return row;
}

/** Update never touches `slug` — it is a stable public identifier, not editable from the form. */
export async function update(
  companyId: string,
  id: string,
  values: Omit<ProjectWrite, 'slug'>,
): Promise<ProjectRow | null> {
  const [row] = await db
    .update(portfolioProjects)
    .set(values)
    .where(and(eq(portfolioProjects.id, id), liveProject(companyId)))
    .returning();

  return row ?? null;
}

export async function softDelete(companyId: string, id: string): Promise<ProjectRow | null> {
  const [row] = await db
    .update(portfolioProjects)
    .set({ deletedAt: new Date() })
    .where(and(eq(portfolioProjects.id, id), liveProject(companyId)))
    .returning();

  return row ?? null;
}

// ---- Project ↔ technology links ----

export interface TechnologyRef {
  id: string;
  name: string;
  slug: string;
}

/** All technologies for a batch of projects in one query, grouped in JS — the Dashboard's two-query pattern. */
export async function listTechnologiesForProjects(
  projectIds: string[],
): Promise<Map<string, TechnologyRef[]>> {
  const map = new Map<string, TechnologyRef[]>();
  if (projectIds.length === 0) return map;

  const rows = await db
    .select({
      projectId: portfolioProjectTechnologies.projectId,
      id: portfolioTechnologies.id,
      name: portfolioTechnologies.name,
      slug: portfolioTechnologies.slug,
    })
    .from(portfolioProjectTechnologies)
    .innerJoin(portfolioTechnologies, eq(portfolioTechnologies.id, portfolioProjectTechnologies.technologyId))
    .where(inArray(portfolioProjectTechnologies.projectId, projectIds));

  for (const row of rows) {
    const list = map.get(row.projectId) ?? [];
    list.push({ id: row.id, name: row.name, slug: row.slug });
    map.set(row.projectId, list);
  }

  return map;
}

export async function listTechnologiesForProject(projectId: string): Promise<TechnologyRef[]> {
  const map = await listTechnologiesForProjects([projectId]);
  return map.get(projectId) ?? [];
}

/** Full replace, same posture as a commercial document's line items: no stable per-row identity to diff. */
export async function setProjectTechnologies(projectId: string, technologyIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(portfolioProjectTechnologies)
      .where(eq(portfolioProjectTechnologies.projectId, projectId));

    if (technologyIds.length > 0) {
      await tx
        .insert(portfolioProjectTechnologies)
        .values(technologyIds.map((technologyId) => ({ projectId, technologyId })));
    }
  });
}

// ---- Gallery images ----

export type ProjectImageRow = typeof portfolioProjectImages.$inferSelect;

export async function listProjectImages(projectId: string): Promise<ProjectImageRow[]> {
  return db
    .select()
    .from(portfolioProjectImages)
    .where(eq(portfolioProjectImages.projectId, projectId))
    .orderBy(asc(portfolioProjectImages.createdAt));
}

/** All gallery images for a batch of projects in one query, grouped in JS — same shape as `listTechnologiesForProjects`. */
export async function listImagesForProjects(projectIds: string[]): Promise<Map<string, ProjectImageRow[]>> {
  const map = new Map<string, ProjectImageRow[]>();
  if (projectIds.length === 0) return map;

  const rows = await db
    .select()
    .from(portfolioProjectImages)
    .where(inArray(portfolioProjectImages.projectId, projectIds))
    .orderBy(asc(portfolioProjectImages.createdAt));

  for (const row of rows) {
    const list = map.get(row.projectId) ?? [];
    list.push(row);
    map.set(row.projectId, list);
  }

  return map;
}

export async function addProjectImage(projectId: string, storageKey: string): Promise<ProjectImageRow> {
  const [row] = await db.insert(portfolioProjectImages).values({ projectId, storageKey }).returning();

  if (!row) throw new Error('Portfolio image insert returned no row');
  return row;
}

/** Scoped by `projectId` too, so an id from a different project can't be deleted by guessing. */
export async function removeProjectImage(projectId: string, imageId: string): Promise<boolean> {
  const deleted = await db
    .delete(portfolioProjectImages)
    .where(and(eq(portfolioProjectImages.id, imageId), eq(portfolioProjectImages.projectId, projectId)))
    .returning({ id: portfolioProjectImages.id });

  return deleted.length > 0;
}

// ---- Public reads (published only) ----

export async function listPublishedProjects(companyId: string): Promise<ProjectListItem[]> {
  return db
    .select(PROJECT_SELECTION)
    .from(portfolioProjects)
    .leftJoin(portfolioCategories, eq(portfolioCategories.id, portfolioProjects.categoryId))
    .where(
      and(
        eq(portfolioProjects.companyId, companyId),
        eq(portfolioProjects.status, 'published'),
        isNull(portfolioProjects.deletedAt),
      ),
    )
    .orderBy(desc(portfolioProjects.createdAt));
}

export async function findPublishedBySlug(companyId: string, slug: string): Promise<ProjectListItem | null> {
  const [row] = await db
    .select(PROJECT_SELECTION)
    .from(portfolioProjects)
    .leftJoin(portfolioCategories, eq(portfolioCategories.id, portfolioProjects.categoryId))
    .where(
      and(
        eq(portfolioProjects.companyId, companyId),
        eq(portfolioProjects.slug, slug),
        eq(portfolioProjects.status, 'published'),
        isNull(portfolioProjects.deletedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

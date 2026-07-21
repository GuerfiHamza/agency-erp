import {
  boolean,
  index,
  pgTable,
  primaryKey as compositeKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { liveRows, primaryKey, softDelete, timestamps } from './_shared';
import { companies } from './companies';
import { portfolioProjectStatusEnum } from './enums';

/**
 * The public-website portfolio: projects shown on the marketing site, pulled
 * through the API in `src/app/api/public/portfolio/`. Distinct from the
 * internal `projects` table (delivery/billing tracking for client work) —
 * a portfolio entry is marketing content, not an operational record, and the
 * two have no fields in common worth sharing.
 */

/** A reusable named technology tag ("WordPress", "Laravel", "HTML", ...). */
export const portfolioTechnologies = pgTable(
  'portfolio_technologies',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    /** Stable identifier for the public API's technology filter/output. */
    slug: text('slug').notNull(),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex('portfolio_technologies_slug_unique').on(table.companyId, table.slug).where(liveRows),
    index('portfolio_technologies_company_id_idx').on(table.companyId),
  ],
);

/** A reusable project category ("Web design", "E-commerce", ...). */
export const portfolioCategories = pgTable(
  'portfolio_categories',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    slug: text('slug').notNull(),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex('portfolio_categories_slug_unique').on(table.companyId, table.slug).where(liveRows),
    index('portfolio_categories_company_id_idx').on(table.companyId),
  ],
);

export const portfolioProjects = pgTable(
  'portfolio_projects',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    title: text('title').notNull(),
    /** What the public API and the marketing site address this project by. */
    slug: text('slug').notNull(),

    shortDescription: text('short_description').notNull(),
    /** The long-form "about this project" writeup. */
    aboutDescription: text('about_description'),

    /** A category is optional and losing it must not delete the project. */
    categoryId: uuid('category_id').references(() => portfolioCategories.id, { onDelete: 'set null' }),

    mainImageKey: text('main_image_key'),

    /** Only meaningful alongside `isLive` — a retired project keeps no working link. */
    websiteUrl: text('website_url'),
    isLive: boolean('is_live').notNull().default(false),

    /** Draft projects never reach the public API — see the enum's own comment. */
    status: portfolioProjectStatusEnum('status').notNull().default('draft'),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex('portfolio_projects_slug_unique').on(table.companyId, table.slug).where(liveRows),
    index('portfolio_projects_company_id_idx').on(table.companyId),
    index('portfolio_projects_category_id_idx').on(table.categoryId),
    index('portfolio_projects_status_idx').on(table.companyId, table.status),
  ],
);

/** Gallery images beyond the one `mainImageKey` — the "more images" the project has. */
export const portfolioProjectImages = pgTable(
  'portfolio_project_images',
  {
    id: primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => portfolioProjects.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),

    createdAt: timestamps.createdAt,
  },
  (table) => [index('portfolio_project_images_project_id_idx').on(table.projectId)],
);

/** A project can use several technologies; a technology spans many projects. */
export const portfolioProjectTechnologies = pgTable(
  'portfolio_project_technologies',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => portfolioProjects.id, { onDelete: 'cascade' }),
    technologyId: uuid('technology_id')
      .notNull()
      .references(() => portfolioTechnologies.id, { onDelete: 'cascade' }),
  },
  (table) => [
    compositeKey({ columns: [table.projectId, table.technologyId] }),
    index('portfolio_project_technologies_technology_id_idx').on(table.technologyId),
  ],
);

import { char, index, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { CURRENCY_LENGTH, liveRows, primaryKey, softDelete, timestamps } from './_shared';
import { companyStatusEnum } from './enums';

/**
 * Companies — the tenant root.
 *
 * Every business table carries `company_id` and every query must scope by it.
 * This is the boundary that keeps one tenant's data out of another's, so the
 * column is `NOT NULL` with `ON DELETE CASCADE` everywhere downstream.
 */
export const companies = pgTable(
  'companies',
  {
    id: primaryKey(),

    name: text('name').notNull(),
    /** URL-safe identifier used for tenant-scoped routes. */
    slug: text('slug').notNull(),
    legalName: text('legal_name'),
    /** VAT / EIN / SIRET — format varies by jurisdiction, so validation lives in the service. */
    taxId: text('tax_id'),
    /** Trade register number — "N° d'immatriculation" (RC) on an Algerian invoice. */
    registrationNumber: text('registration_number'),
    /** Numéro d'Identification Fiscale — distinct from `taxId`, always shown by its own label. */
    nif: text('nif'),
    /** N° Article — the tax article number ("Article d'imposition"). */
    articleNumber: text('article_number'),
    /** Registered business activity, e.g. "Services informatiques" — printed on issued documents. */
    activity: text('activity'),
    /** "Nom et Prénom" of the legal representative/manager, distinct from the trade name. */
    managerName: text('manager_name'),
    /** Short internal code (e.g. "AM") printed as part of "Réf N°.../{code}/YY" on issued documents. */
    documentReferenceCode: text('document_reference_code'),

    email: text('email'),
    phone: text('phone'),
    website: text('website'),

    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    /** ISO 3166-1 alpha-2. */
    country: char('country', { length: 2 }),

    logoUrl: text('logo_url'),

    /** Tenant default; individual documents still store their own currency. */
    defaultCurrency: char('default_currency', { length: CURRENCY_LENGTH }).notNull().default('DZD'),
    /** IANA zone, e.g. "Europe/Paris". Drives due-date and reporting boundaries. */
    timezone: text('timezone').notNull().default('UTC'),

    status: companyStatusEnum('status').notNull().default('active'),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    // Partial: a soft-deleted company must not reserve its slug forever.
    uniqueIndex('companies_slug_unique').on(table.slug).where(liveRows),
    index('companies_status_idx').on(table.status),
    index('companies_deleted_at_idx').on(table.deletedAt),
  ],
);

import { sql } from 'drizzle-orm';
import { boolean, char, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { CURRENCY_LENGTH, primaryKey, softDelete, timestamps } from './_shared';
import { user } from './auth';
import { companies } from './companies';
import { clientStatusEnum, clientTypeEnum } from './enums';

/** Clients of the agency, and the people who work for them. */

export const clients = pgTable(
  'clients',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    type: clientTypeEnum('type').notNull().default('company'),
    status: clientStatusEnum('status').notNull().default('prospect'),

    legalName: text('legal_name'),
    taxId: text('tax_id'),
    email: text('email'),
    phone: text('phone'),
    website: text('website'),

    /** Billing address. A shipping address lives on the document when it differs. */
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    country: char('country', { length: 2 }),

    /** Overrides the company default on this client's new documents. */
    currency: char('currency', { length: CURRENCY_LENGTH }),
    /** Net terms in days; drives invoice due dates. */
    paymentTermsDays: integer('payment_terms_days'),

    /** Account manager. `set null` so losing an employee never deletes a client. */
    ownerId: uuid('owner_id').references(() => user.id, { onDelete: 'set null' }),

    notes: text('notes'),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index('clients_company_id_idx').on(table.companyId),
    index('clients_status_idx').on(table.companyId, table.status),
    index('clients_owner_id_idx').on(table.ownerId),
    index('clients_name_idx').on(table.companyId, table.name),
    index('clients_deleted_at_idx').on(table.deletedAt),
  ],
);

export const contacts = pgTable(
  'contacts',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),

    firstName: text('first_name').notNull(),
    lastName: text('last_name'),
    email: text('email'),
    phone: text('phone'),
    mobile: text('mobile'),
    jobTitle: text('job_title'),

    /** The default recipient for this client's documents. */
    isPrimary: boolean('is_primary').notNull().default(false),
    notes: text('notes'),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index('contacts_company_id_idx').on(table.companyId),
    index('contacts_client_id_idx').on(table.clientId),
    index('contacts_email_idx').on(table.companyId, table.email),
    // At most one primary contact per client, enforced by the database rather
    // than by a read-modify-write race in a service.
    uniqueIndex('contacts_client_primary_unique')
      .on(table.clientId)
      .where(sql`deleted_at IS NULL AND is_primary`),
    index('contacts_deleted_at_idx').on(table.deletedAt),
  ],
);

import { char, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { CURRENCY_LENGTH, primaryKey, softDelete, timestamps } from './_shared';
import { companies } from './companies';
import { supplierStatusEnum } from './enums';

/** Vendors the agency buys from. Counterpart to `clients` on the purchasing side. */
export const suppliers = pgTable(
  'suppliers',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    legalName: text('legal_name'),
    taxId: text('tax_id'),
    status: supplierStatusEnum('status').notNull().default('active'),

    email: text('email'),
    phone: text('phone'),
    website: text('website'),

    contactName: text('contact_name'),

    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    country: char('country', { length: 2 }),

    currency: char('currency', { length: CURRENCY_LENGTH }),
    /** Net terms in days the supplier grants us. */
    paymentTermsDays: integer('payment_terms_days'),

    notes: text('notes'),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index('suppliers_company_id_idx').on(table.companyId),
    index('suppliers_status_idx').on(table.companyId, table.status),
    index('suppliers_name_idx').on(table.companyId, table.name),
    index('suppliers_deleted_at_idx').on(table.deletedAt),
  ],
);

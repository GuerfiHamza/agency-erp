/**
 * Schema barrel.
 *
 * Every table, enum, and relation must be re-exported here: `drizzle-kit` reads
 * this file to plan migrations, and the Drizzle client is typed from it. A table
 * missing from this file silently never gets a migration.
 *
 * `_shared.ts` is intentionally not exported — it holds column builders, not
 * schema objects, and exporting it would put non-tables into the client type.
 */

export * from './enums';

// Tenancy and identity
export * from './companies';
export * from './auth';
export * from './rbac';
export * from './invitations';

// Commercial relationships
export * from './clients';
export * from './crm';
export * from './suppliers';

// Delivery
export * from './projects';
export * from './tasks';
export * from './documents';
export * from './calendar';

// Money
export * from './quotes';
export * from './proforma-invoices';
export * from './invoices';
export * from './purchase-orders';
export * from './payments';
export * from './expenses';

// Platform
export * from './notifications';
export * from './settings';
export * from './portfolio';

// Must come last: relations reference every table above.
export * from './relations';

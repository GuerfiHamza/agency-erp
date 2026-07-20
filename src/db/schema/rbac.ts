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
import { user } from './auth';
import { companies } from './companies';

/**
 * Role-based access control.
 *
 * Permissions are global and immutable (`resource` + `action`); roles are
 * per-company and map to permissions many-to-many. A user may hold several
 * roles, and their effective permission set is the union — resolved by the
 * authorization service in Phase 3, not here.
 */

/**
 * A grantable capability, e.g. resource "invoices" + action "delete".
 *
 * Global rather than per-company: the set of things the software can do is a
 * property of the code, not of a tenant. Seeded from a fixed catalogue.
 */
export const permissions = pgTable(
  'permissions',
  {
    id: primaryKey(),
    /** Stable machine key, e.g. "invoices:delete". Referenced by code. */
    slug: text('slug').notNull(),
    resource: text('resource').notNull(),
    action: text('action').notNull(),
    description: text('description'),
    ...timestamps,
  },
  (table) => [
    // Not partial: permissions are never soft-deleted, and code depends on the
    // slug resolving to exactly one row.
    uniqueIndex('permissions_slug_unique').on(table.slug),
    uniqueIndex('permissions_resource_action_unique').on(table.resource, table.action),
    index('permissions_resource_idx').on(table.resource),
  ],
);

export const roles = pgTable(
  'roles',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    /**
     * System roles (owner, admin, member) are seeded per company and must not be
     * renamed or deleted through the UI — the service refuses to mutate them.
     */
    isSystem: boolean('is_system').notNull().default(false),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex('roles_company_slug_unique').on(table.companyId, table.slug).where(liveRows),
    index('roles_company_id_idx').on(table.companyId),
    index('roles_deleted_at_idx').on(table.deletedAt),
  ],
);

/**
 * Role → permission grants.
 *
 * Composite primary key: the pair is the identity, which makes a duplicate
 * grant impossible at the database level rather than relying on service code.
 */
export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    compositeKey({ columns: [table.roleId, table.permissionId] }),
    index('role_permissions_permission_id_idx').on(table.permissionId),
  ],
);

/** User → role assignments, scoped to the role's company. */
export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    /** Who granted it — required for audit; null once that user is hard-deleted. */
    assignedBy: uuid('assigned_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    compositeKey({ columns: [table.userId, table.roleId] }),
    index('user_roles_role_id_idx').on(table.roleId),
  ],
);

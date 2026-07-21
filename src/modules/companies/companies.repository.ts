import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { companies, user } from '@/db/schema';

import type { UpdateCompanyInput } from './companies.validation';

/**
 * Company data access. The only place in the module that touches Drizzle.
 *
 * Every query filters `deleted_at IS NULL`. A soft-deleted company must read as
 * absent, not as a company that happens to have a timestamp set — see MEMORY.md,
 * "Schema conventions".
 */

export type Company = typeof companies.$inferSelect;

/** A company by id. `null` when missing or soft-deleted. */
export async function findById(companyId: string): Promise<Company | null> {
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), isNull(companies.deletedAt)),
  });

  return company ?? null;
}

/** A company by slug. Used by tenant-scoped routes. */
export async function findBySlug(slug: string): Promise<Company | null> {
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.slug, slug), isNull(companies.deletedAt)),
  });

  return company ?? null;
}

/**
 * The one live company row, for callers with no session to derive a tenant
 * from — currently only the public portfolio API. Correct precisely because
 * this deployment is locked to a single tenant (see MEMORY's "Single-tenant
 * lockdown"); a multi-tenant version of this app could not use this.
 */
export async function findSoleCompany(): Promise<Company | null> {
  const company = await db.query.companies.findFirst({
    where: isNull(companies.deletedAt),
  });

  return company ?? null;
}

/**
 * Update a company's profile. Returns `null` if it does not exist.
 *
 * The `deleted_at IS NULL` in the WHERE is load-bearing, not defensive: without
 * it a stale form open in another tab could resurrect the profile of a company
 * that was deleted in the meantime.
 *
 * `slug` is intentionally absent from the accepted fields — see the service.
 */
export async function update(companyId: string, values: UpdateCompanyInput): Promise<Company | null> {
  const [updated] = await db
    .update(companies)
    .set(values)
    .where(and(eq(companies.id, companyId), isNull(companies.deletedAt)))
    .returning();

  return updated ?? null;
}

/**
 * Soft-delete a company and deactivate everyone in it.
 *
 * The two halves are one operation, and the second is what makes the first mean
 * anything. Setting `deleted_at` alone revokes nothing: existing sessions stay
 * valid, their cookies still carry a `companyId`, and `requireTenantSession`
 * keeps handing it out — the tenant would be "deleted" while its users carried
 * on working. Deactivating the users routes the revocation through `getSession`,
 * the one chokepoint that already rejects `isActive === false` on every request.
 *
 * Not a hard delete: children cascade from `companies`, which would take the
 * invoices and payments with them. Financial history outlives the account.
 */
export async function softDelete(companyId: string): Promise<Company | null> {
  return db.transaction(async (tx) => {
    const [deleted] = await tx
      .update(companies)
      .set({ deletedAt: new Date(), status: 'inactive' })
      .where(and(eq(companies.id, companyId), isNull(companies.deletedAt)))
      .returning();

    if (!deleted) return null;

    await tx.update(user).set({ isActive: false }).where(eq(user.companyId, companyId));

    return deleted;
  });
}

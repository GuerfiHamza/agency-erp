import { and, asc, count, desc, eq, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { suppliers } from '@/db/schema';
import { buildPaginatedResult, toOffset } from '@/lib/helpers';
import type { PaginatedResult, PaginationParams, SortDirection } from '@/types';

import type { SupplierInput, SupplierSortField, SupplierStatus } from './suppliers.validation';

/**
 * Supplier data access. The only place in the module that touches Drizzle.
 *
 * Every query is scoped by `companyId` and filters `deleted_at IS NULL`. Not
 * marked `server-only`: scripts and tests import it, and the ESLint boundary
 * already stops UI reaching `@/db`. Simpler than Clients' repository — there
 * is no owner to join, so no second table is ever touched here.
 */

export type SupplierRow = typeof suppliers.$inferSelect;

const liveSupplier = (companyId: string) =>
  and(eq(suppliers.companyId, companyId), isNull(suppliers.deletedAt)) as SQL;

const SORT_COLUMNS = {
  name: suppliers.name,
  status: suppliers.status,
  createdAt: suppliers.createdAt,
} as const;

export interface ListSuppliersQuery extends PaginationParams {
  search?: string;
  sort?: { field: SupplierSortField; direction: SortDirection };
  statuses?: SupplierStatus[];
}

function buildFilters(companyId: string, query: Pick<ListSuppliersQuery, 'search' | 'statuses'>): SQL {
  const filters: SQL[] = [liveSupplier(companyId)];

  if (query.search) {
    // Escape LIKE metacharacters: a search for "100%" must not match everything.
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    filters.push(
      or(ilike(suppliers.name, term), ilike(suppliers.email, term), ilike(suppliers.legalName, term)) as SQL,
    );
  }

  if (query.statuses && query.statuses.length > 0) {
    filters.push(inArray(suppliers.status, query.statuses));
  }

  return and(...filters) as SQL;
}

export async function listSuppliers(
  companyId: string,
  query: ListSuppliersQuery,
): Promise<PaginatedResult<SupplierRow>> {
  const where = buildFilters(companyId, query);

  const sortColumn = SORT_COLUMNS[query.sort?.field ?? 'name'];
  const direction = query.sort?.direction === 'desc' ? desc : asc;

  const [items, [total]] = await Promise.all([
    db
      .select()
      .from(suppliers)
      .where(where)
      // Stable tiebreak on id: without it two suppliers with the same name can
      // swap places between pages and one is never shown.
      .orderBy(direction(sortColumn), asc(suppliers.id))
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db.select({ value: count() }).from(suppliers).where(where),
  ]);

  return buildPaginatedResult(items, total?.value ?? 0, query);
}

/** One supplier, scoped to the company. `null` when missing, deleted, or another tenant's. */
export async function findById(companyId: string, supplierId: string): Promise<SupplierRow | null> {
  const [row] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), liveSupplier(companyId)))
    .limit(1);

  return row ?? null;
}

export async function create(companyId: string, values: SupplierInput): Promise<SupplierRow> {
  const [row] = await db
    .insert(suppliers)
    .values({ ...values, companyId })
    .returning();

  if (!row) throw new Error('Supplier insert returned no row');

  return row;
}

export async function update(
  companyId: string,
  supplierId: string,
  values: SupplierInput,
): Promise<SupplierRow | null> {
  const [row] = await db
    .update(suppliers)
    .set(values)
    .where(and(eq(suppliers.id, supplierId), liveSupplier(companyId)))
    .returning();

  return row ?? null;
}

export async function softDelete(companyId: string, supplierId: string): Promise<SupplierRow | null> {
  const [row] = await db
    .update(suppliers)
    .set({ deletedAt: new Date() })
    .where(and(eq(suppliers.id, supplierId), liveSupplier(companyId)))
    .returning();

  return row ?? null;
}

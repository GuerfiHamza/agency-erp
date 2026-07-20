import { and, asc, count, desc, eq, getTableColumns, ilike, inArray, isNull, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { expenses, projects, suppliers, user } from '@/db/schema';
import { buildPaginatedResult, toOffset } from '@/lib/helpers';
import type { PaginatedResult, PaginationParams, SortDirection } from '@/types';

import type {
  ExpenseCreateInput,
  ExpenseDetailsInput,
  ExpenseSortField,
  ExpenseStatus,
} from './expenses.validation';

/**
 * Expense data access. The only place in the module that touches Drizzle.
 *
 * Every query is scoped by `companyId` and filters `deleted_at IS NULL`. Not
 * marked `server-only`: scripts and tests import it, and the ESLint boundary
 * already stops UI reaching `@/db`.
 *
 * `listProjectOptions`/`listSupplierOptions` query `projects`/`suppliers`
 * directly rather than through their own modules' services — the same
 * lightweight-picker posture Invoices and Purchase Orders each took toward
 * `clients`/`suppliers`, even where a fuller service already exists
 * elsewhere. The tenant *guard* for a posted id still goes through the real
 * services (see the service layer) — this is only the option list for a
 * `<Select>`.
 */

export type ExpenseRow = typeof expenses.$inferSelect;

export type ExpenseListItem = ExpenseRow & {
  projectName: string | null;
  supplierName: string | null;
  userName: string | null;
};

const liveExpense = (companyId: string) =>
  and(eq(expenses.companyId, companyId), isNull(expenses.deletedAt)) as SQL;

const SORT_COLUMNS = {
  spentOn: expenses.spentOn,
  amount: expenses.amount,
  status: expenses.status,
  createdAt: expenses.createdAt,
} as const;

const SELECTION = {
  ...getTableColumns(expenses),
  projectName: projects.name,
  supplierName: suppliers.name,
  userName: user.name,
};

export interface ListExpensesQuery extends PaginationParams {
  search?: string;
  sort?: { field: ExpenseSortField; direction: SortDirection };
  statuses?: ExpenseStatus[];
}

function buildFilters(companyId: string, query: Pick<ListExpensesQuery, 'search' | 'statuses'>): SQL {
  const filters: SQL[] = [liveExpense(companyId)];

  if (query.search) {
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    filters.push(ilike(expenses.description, term) as SQL);
  }

  if (query.statuses && query.statuses.length > 0) {
    filters.push(inArray(expenses.status, query.statuses));
  }

  return and(...filters) as SQL;
}

export async function listExpenses(
  companyId: string,
  query: ListExpensesQuery,
): Promise<PaginatedResult<ExpenseListItem>> {
  const where = buildFilters(companyId, query);

  const sortColumn = SORT_COLUMNS[query.sort?.field ?? 'spentOn'];
  const direction = query.sort?.direction === 'asc' ? asc : desc;

  const [items, [total]] = await Promise.all([
    db
      .select(SELECTION)
      .from(expenses)
      .leftJoin(projects, eq(projects.id, expenses.projectId))
      .leftJoin(suppliers, eq(suppliers.id, expenses.supplierId))
      .leftJoin(user, eq(user.id, expenses.userId))
      .where(where)
      .orderBy(direction(sortColumn), asc(expenses.id))
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db
      .select({ value: count() })
      .from(expenses)
      .leftJoin(projects, eq(projects.id, expenses.projectId))
      .leftJoin(suppliers, eq(suppliers.id, expenses.supplierId))
      .leftJoin(user, eq(user.id, expenses.userId))
      .where(where),
  ]);

  return buildPaginatedResult(items, total?.value ?? 0, query);
}

export async function findById(companyId: string, id: string): Promise<ExpenseListItem | null> {
  const [row] = await db
    .select(SELECTION)
    .from(expenses)
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .leftJoin(suppliers, eq(suppliers.id, expenses.supplierId))
    .leftJoin(user, eq(user.id, expenses.userId))
    .where(and(eq(expenses.id, id), liveExpense(companyId)))
    .limit(1);

  return row ?? null;
}

export async function userBelongsToCompany(companyId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        eq(user.id, userId),
        eq(user.companyId, companyId),
        eq(user.isActive, true),
        isNull(user.deletedAt),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export type ExpenseCreateWrite = ExpenseCreateInput;
export type ExpenseUpdateWrite = ExpenseDetailsInput;

export async function create(companyId: string, values: ExpenseCreateWrite): Promise<ExpenseRow> {
  const [row] = await db
    .insert(expenses)
    .values({ ...values, companyId })
    .returning();

  if (!row) throw new Error('Expense insert returned no row');

  return row;
}

/** A draft-only edit. The caller (service) has already refused anything past `draft`. Never touches `receiptStorageKey`. */
export async function update(
  companyId: string,
  id: string,
  values: ExpenseUpdateWrite,
): Promise<ExpenseRow | null> {
  const [row] = await db
    .update(expenses)
    .set(values)
    .where(and(eq(expenses.id, id), liveExpense(companyId)))
    .returning();

  return row ?? null;
}

/** Status-only transitions (submit, approve, reject, reimburse) that never touch the editable fields. */
export async function updateStatus(
  companyId: string,
  id: string,
  values: {
    status: ExpenseStatus;
    submittedAt?: Date | null;
    approvedById?: string | null;
    approvedAt?: Date | null;
    rejectedAt?: Date | null;
    rejectionReason?: string | null;
    reimbursedAt?: Date | null;
  },
): Promise<ExpenseRow | null> {
  const [row] = await db
    .update(expenses)
    .set(values)
    .where(and(eq(expenses.id, id), liveExpense(companyId)))
    .returning();

  return row ?? null;
}

export async function softDelete(companyId: string, id: string): Promise<ExpenseRow | null> {
  const [row] = await db
    .update(expenses)
    .set({ deletedAt: new Date() })
    .where(and(eq(expenses.id, id), liveExpense(companyId)))
    .returning();

  return row ?? null;
}

export async function listProjectOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.companyId, companyId), isNull(projects.deletedAt)))
    .orderBy(asc(projects.name));
}

export async function listSupplierOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(and(eq(suppliers.companyId, companyId), isNull(suppliers.deletedAt)))
    .orderBy(asc(suppliers.name));
}

export async function listUserOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(eq(user.companyId, companyId), eq(user.isActive, true), isNull(user.deletedAt)))
    .orderBy(asc(user.name));
}

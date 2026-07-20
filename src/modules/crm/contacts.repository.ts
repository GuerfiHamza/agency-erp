import { and, asc, count, desc, eq, getTableColumns, ilike, isNull, ne, or, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { clients, contacts } from '@/db/schema';
import { buildPaginatedResult, toOffset } from '@/lib/helpers';
import type { PaginatedResult, PaginationParams, SortDirection } from '@/types';

import type { ContactInput, ContactSortField } from './contacts.validation';

/**
 * Contact data access. The only place in the module that touches Drizzle.
 *
 * Scoped by `companyId`, filters `deleted_at IS NULL`. Not `server-only`:
 * scripts and tests import it, and the ESLint boundary stops UI reaching `@/db`.
 */

export type ContactRow = typeof contacts.$inferSelect;

/** The list row: the contact plus the client's name in one round trip. */
export type ContactListItem = ContactRow & { clientName: string };

const liveContact = (companyId: string) =>
  and(eq(contacts.companyId, companyId), isNull(contacts.deletedAt)) as SQL;

const SORT_COLUMNS = {
  firstName: contacts.firstName,
  createdAt: contacts.createdAt,
} as const;

export interface ListContactsQuery extends PaginationParams {
  search?: string;
  sort?: { field: ContactSortField; direction: SortDirection };
}

const SELECTION = { ...getTableColumns(contacts), clientName: clients.name };

export async function listContacts(
  companyId: string,
  query: ListContactsQuery,
): Promise<PaginatedResult<ContactListItem>> {
  const filters: SQL[] = [liveContact(companyId)];

  if (query.search) {
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    filters.push(
      or(ilike(contacts.firstName, term), ilike(contacts.lastName, term), ilike(contacts.email, term)) as SQL,
    );
  }

  const where = and(...filters);

  const sortColumn = SORT_COLUMNS[query.sort?.field ?? 'firstName'];
  const direction = query.sort?.direction === 'desc' ? desc : asc;

  const [items, [total]] = await Promise.all([
    db
      .select(SELECTION)
      .from(contacts)
      .innerJoin(clients, eq(clients.id, contacts.clientId))
      .where(where)
      .orderBy(direction(sortColumn), asc(contacts.id))
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db.select({ value: count() }).from(contacts).where(where),
  ]);

  return buildPaginatedResult(items, total?.value ?? 0, query);
}

export async function findById(companyId: string, id: string): Promise<ContactListItem | null> {
  const [row] = await db
    .select(SELECTION)
    .from(contacts)
    .innerJoin(clients, eq(clients.id, contacts.clientId))
    .where(and(eq(contacts.id, id), liveContact(companyId)))
    .limit(1);

  return row ?? null;
}

/** Confirm a client id belongs to this company and is live — the tenant boundary the FK can't check. */
export async function clientBelongsToCompany(companyId: string, clientId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.companyId, companyId), isNull(clients.deletedAt)))
    .limit(1);

  return Boolean(row);
}

/**
 * Demote any current primary for a client, optionally except one row.
 *
 * The partial unique index (`is_primary AND deleted_at IS NULL`, per client)
 * makes two primaries a database error, so promoting one must clear the other in
 * the same transaction rather than racing it.
 */
function clearOtherPrimaries(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  clientId: string,
  exceptId?: string,
) {
  const where = [eq(contacts.clientId, clientId), eq(contacts.isPrimary, true), isNull(contacts.deletedAt)];
  if (exceptId) where.push(ne(contacts.id, exceptId));

  return tx
    .update(contacts)
    .set({ isPrimary: false })
    .where(and(...where));
}

export async function create(companyId: string, values: ContactInput): Promise<ContactRow> {
  return db.transaction(async (tx) => {
    if (values.isPrimary) await clearOtherPrimaries(tx, values.clientId);

    const [row] = await tx
      .insert(contacts)
      .values({ ...values, companyId })
      .returning();

    if (!row) throw new Error('Contact insert returned no row');

    return row;
  });
}

export async function update(
  companyId: string,
  id: string,
  values: ContactInput,
): Promise<ContactRow | null> {
  return db.transaction(async (tx) => {
    if (values.isPrimary) await clearOtherPrimaries(tx, values.clientId, id);

    const [row] = await tx
      .update(contacts)
      .set(values)
      .where(and(eq(contacts.id, id), liveContact(companyId)))
      .returning();

    return row ?? null;
  });
}

export async function softDelete(companyId: string, id: string): Promise<ContactRow | null> {
  const [row] = await db
    .update(contacts)
    // Also drop the primary flag: a deleted contact must free the partial unique
    // slot so another can become primary.
    .set({ deletedAt: new Date(), isPrimary: false })
    .where(and(eq(contacts.id, id), liveContact(companyId)))
    .returning();

  return row ?? null;
}

export async function listClientOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(eq(clients.companyId, companyId), isNull(clients.deletedAt)))
    .orderBy(asc(clients.name));
}

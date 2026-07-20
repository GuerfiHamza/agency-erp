import { and, asc, count, desc, eq, getTableColumns, ilike, inArray, isNull, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { clients, documents, projects, tasks, user } from '@/db/schema';
import { buildPaginatedResult, toOffset } from '@/lib/helpers';
import type { PaginatedResult, PaginationParams, SortDirection } from '@/types';

import type {
  DocumentAttachKind,
  DocumentDetailsInput,
  DocumentSortField,
  DocumentType,
} from './documents.validation';

/**
 * Document data access. The only place in the module that touches Drizzle.
 *
 * Scoped by `companyId`, filters `deleted_at IS NULL`. Not `server-only`:
 * scripts and tests import it, and the ESLint boundary stops UI reaching `@/db`.
 */

export type DocumentRow = typeof documents.$inferSelect;

/** The list row: the document plus its attachment resolved to one kind + label. */
export type DocumentListItem = DocumentRow & {
  attachedKind: DocumentAttachKind;
  attachedLabel: string | null;
  uploadedByName: string | null;
};

/** The attachment as columns — exactly one non-null, or all null. */
export interface AttachmentColumns {
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
}

export type DocumentCreateWrite = Omit<DocumentDetailsInput, 'attachKind' | 'attachId'> &
  AttachmentColumns & {
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    uploadedById: string | null;
  };

export type DocumentUpdateWrite = Omit<DocumentDetailsInput, 'attachKind' | 'attachId'> & AttachmentColumns;

const liveDocument = (companyId: string) =>
  and(eq(documents.companyId, companyId), isNull(documents.deletedAt)) as SQL;

const SORT_COLUMNS = {
  name: documents.name,
  type: documents.type,
  sizeBytes: documents.sizeBytes,
  createdAt: documents.createdAt,
} as const;

const SELECTION = {
  ...getTableColumns(documents),
  clientName: clients.name,
  projectName: projects.name,
  taskTitle: tasks.title,
  uploadedByName: user.name,
};

type SelectedRow = DocumentRow & {
  clientName: string | null;
  projectName: string | null;
  taskTitle: string | null;
  uploadedByName: string | null;
};

/** Collapse the three nullable targets back into one kind + label for display. */
function toListItem(row: SelectedRow): DocumentListItem {
  const { clientName, projectName, taskTitle, ...document } = row;

  if (document.clientId) return { ...document, attachedKind: 'client', attachedLabel: clientName };
  if (document.projectId) return { ...document, attachedKind: 'project', attachedLabel: projectName };
  if (document.taskId) return { ...document, attachedKind: 'task', attachedLabel: taskTitle };

  return { ...document, attachedKind: 'none', attachedLabel: null };
}

export interface ListDocumentsQuery extends PaginationParams {
  search?: string;
  sort?: { field: DocumentSortField; direction: SortDirection };
  types?: DocumentType[];
}

export async function listDocuments(
  companyId: string,
  query: ListDocumentsQuery,
): Promise<PaginatedResult<DocumentListItem>> {
  const filters: SQL[] = [liveDocument(companyId)];

  if (query.search) {
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    filters.push(ilike(documents.name, term));
  }

  if (query.types && query.types.length > 0) {
    filters.push(inArray(documents.type, query.types));
  }

  const where = and(...filters);

  // Newest first: a document library is read as "what was just added".
  const sortColumn = SORT_COLUMNS[query.sort?.field ?? 'createdAt'];
  const direction = query.sort?.direction === 'asc' ? asc : desc;

  const [rows, [total]] = await Promise.all([
    db
      .select(SELECTION)
      .from(documents)
      .leftJoin(clients, eq(clients.id, documents.clientId))
      .leftJoin(projects, eq(projects.id, documents.projectId))
      .leftJoin(tasks, eq(tasks.id, documents.taskId))
      .leftJoin(user, eq(user.id, documents.uploadedById))
      .where(where)
      .orderBy(direction(sortColumn), asc(documents.id))
      .limit(query.pageSize)
      .offset(toOffset(query)),
    db.select({ value: count() }).from(documents).where(where),
  ]);

  return buildPaginatedResult(rows.map(toListItem), total?.value ?? 0, query);
}

export async function findById(companyId: string, id: string): Promise<DocumentListItem | null> {
  const [row] = await db
    .select(SELECTION)
    .from(documents)
    .leftJoin(clients, eq(clients.id, documents.clientId))
    .leftJoin(projects, eq(projects.id, documents.projectId))
    .leftJoin(tasks, eq(tasks.id, documents.taskId))
    .leftJoin(user, eq(user.id, documents.uploadedById))
    .where(and(eq(documents.id, id), liveDocument(companyId)))
    .limit(1);

  return row ? toListItem(row) : null;
}

/** Confirm an attachment target belongs to this company and is live — the tenant boundary the FK can't check. */
export async function attachmentExists(
  companyId: string,
  kind: Exclude<DocumentAttachKind, 'none'>,
  id: string,
): Promise<boolean> {
  const table = { client: clients, project: projects, task: tasks }[kind];

  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.companyId, companyId), isNull(table.deletedAt)))
    .limit(1);

  return Boolean(row);
}

export async function create(companyId: string, values: DocumentCreateWrite): Promise<DocumentRow> {
  const [row] = await db
    .insert(documents)
    .values({ ...values, companyId })
    .returning();

  if (!row) throw new Error('Document insert returned no row');

  return row;
}

export async function update(
  companyId: string,
  id: string,
  values: DocumentUpdateWrite,
): Promise<DocumentRow | null> {
  const [row] = await db
    .update(documents)
    .set(values)
    .where(and(eq(documents.id, id), liveDocument(companyId)))
    .returning();

  return row ?? null;
}

export async function softDelete(companyId: string, id: string): Promise<DocumentRow | null> {
  const [row] = await db
    .update(documents)
    .set({ deletedAt: new Date() })
    .where(and(eq(documents.id, id), liveDocument(companyId)))
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

export async function listProjectOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.companyId, companyId), isNull(projects.deletedAt)))
    .orderBy(asc(projects.name));
}

export async function listTaskOptions(companyId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: tasks.id, name: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.companyId, companyId), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.title));
}

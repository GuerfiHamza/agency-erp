import { bigint, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { primaryKey, softDelete, timestamps } from './_shared';
import { user } from './auth';
import { clients } from './clients';
import { companies } from './companies';
import { documentTypeEnum } from './enums';
import { projects } from './projects';
import { tasks } from './tasks';

/**
 * Uploaded files.
 *
 * Attachment targets are explicit nullable foreign keys rather than a
 * polymorphic `entity_type`/`entity_id` pair. That keeps referential integrity
 * — the database still guarantees the target exists and cascades on delete —
 * at the cost of one column per attachable entity. A polymorphic pair would be
 * shorter but would let a document outlive its owner as an invisible orphan.
 *
 * The row is metadata only: bytes live in object storage under `storageKey`.
 * Deleting a row does not delete the object; that is the storage service's job
 * in Phase 4.
 */
export const documents = pgTable(
  'documents',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    type: documentTypeEnum('type').notNull().default('other'),
    description: text('description'),

    /** Object storage key. Never a public URL — access is brokered by signed URLs. */
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull(),
    /** Bytes. bigint because files exceed the 2GB int4 ceiling. */
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    /** Hex digest, for deduplication and integrity checks. */
    checksum: text('checksum'),

    // Attachment targets — all optional.
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),

    uploadedById: uuid('uploaded_by_id').references(() => user.id, { onDelete: 'set null' }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index('documents_company_id_idx').on(table.companyId),
    index('documents_client_id_idx').on(table.clientId),
    index('documents_project_id_idx').on(table.projectId),
    index('documents_task_id_idx').on(table.taskId),
    index('documents_type_idx').on(table.companyId, table.type),
    index('documents_deleted_at_idx').on(table.deletedAt),
  ],
);

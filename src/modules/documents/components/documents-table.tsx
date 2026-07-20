'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Download, MoreHorizontal, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { DataTable, DataTableColumnHeader, useTableParams } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/states';
import { presignDownloadAction } from '@/modules/storage/storage.actions';

import { deleteDocumentAction } from '../documents.actions';
import type { DocumentListItem } from '../documents.service';
import { DOCUMENT_TYPES } from '../documents.validation';

import { DocumentFormDialog, type AttachmentOptions } from './document-form-dialog';

interface Props {
  documents: DocumentListItem[];
  totalItems: number;
  attachmentOptions: AttachmentOptions;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; doc: DocumentListItem }
  | { kind: 'delete'; doc: DocumentListItem };

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function humanise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The download is a fresh signed URL every time, minted on click — links are
 * short-lived, so one baked into the table at render time would expire while the
 * page sat open.
 */
async function download(doc: DocumentListItem) {
  const result = await presignDownloadAction({ key: doc.storageKey, download: true });

  if (!result.success) {
    toast.error(result.error.message);
    return;
  }

  window.location.href = result.data.url;
}

export function DocumentsTable({
  documents,
  totalItems,
  attachmentOptions,
  canCreate,
  canUpdate,
  canDelete,
}: Props) {
  const { hasActiveFilters } = useTableParams();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });

  const close = () => setDialog({ kind: 'none' });

  const columns = useMemo<ColumnDef<DocumentListItem, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <DataTableColumnHeader columnId="name" title="Document" />,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.mimeType}</p>
          </div>
        ),
      },
      {
        accessorKey: 'type',
        header: () => <DataTableColumnHeader columnId="type" title="Type" />,
        cell: ({ row }) => <Badge variant="secondary">{humanise(row.original.type)}</Badge>,
      },
      {
        id: 'attachedTo',
        header: 'Attached to',
        cell: ({ row }) =>
          row.original.attachedLabel ? (
            <div className="min-w-0">
              <p className="truncate text-sm">{row.original.attachedLabel}</p>
              <p className="text-xs text-muted-foreground">{humanise(row.original.attachedKind)}</p>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: 'sizeBytes',
        header: () => <DataTableColumnHeader columnId="sizeBytes" title="Size" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {formatBytes(row.original.sizeBytes)}
          </span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: () => <DataTableColumnHeader columnId="createdAt" title="Added" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {dateFormatter.format(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const doc = row.original;

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal aria-hidden />
                    <span className="sr-only">Actions for {doc.name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => void download(doc)}>
                    <Download aria-hidden />
                    Download
                  </DropdownMenuItem>
                  {canUpdate && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit', doc })}>
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDialog({ kind: 'delete', doc })}
                      >
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [canDelete, canUpdate],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={documents}
        totalItems={totalItems}
        getRowId={(row) => row.id}
        searchPlaceholder="Search documents..."
        statusOptions={DOCUMENT_TYPES.map((type) => ({ label: humanise(type), value: type }))}
        hasActiveFilters={hasActiveFilters}
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
              <Plus aria-hidden />
              Upload
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            title="No documents yet"
            description="Upload a contract, brief, or deliverable to keep it with the work it belongs to."
            action={
              canCreate ? (
                <Button onClick={() => setDialog({ kind: 'create' })}>
                  <Plus aria-hidden />
                  Upload
                </Button>
              ) : undefined
            }
          />
        }
      />

      {dialog.kind === 'create' && (
        <DocumentFormDialog attachmentOptions={attachmentOptions} open onOpenChange={close} />
      )}

      {dialog.kind === 'edit' && (
        <DocumentFormDialog
          document={dialog.doc}
          attachmentOptions={attachmentOptions}
          open
          onOpenChange={close}
        />
      )}

      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={`Delete ${dialog.doc.name}?`}
          description="The document is removed from this workspace. Anyone holding an old download link loses access."
          confirmLabel="Delete"
          successMessage="Document deleted."
          onConfirm={() => deleteDocumentAction({ documentId: dialog.doc.id })}
        />
      )}
    </>
  );
}

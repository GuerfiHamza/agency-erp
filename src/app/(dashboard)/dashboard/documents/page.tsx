import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { loadTableParams } from '@/lib/table/search-params';
import { DocumentsTable } from '@/modules/documents/components/documents-table';
import * as documents from '@/modules/documents/documents.service';
import { isDocumentSortField, toDocumentTypeFilters } from '@/modules/documents/documents.validation';

export const metadata: Metadata = { title: 'Documents' };

/**
 * The file library: everything uploaded, and what it is attached to.
 *
 * Table state is read from the URL and passed straight into SQL. The auth check
 * is here rather than in a layout — layouts do not re-run on client-side
 * navigation.
 */
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { companyId } = await requireTenantSession();

  if (!(await can('documents:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view documents in this workspace."
        />
      </main>
    );
  }

  const params = await loadTableParams(searchParams);

  const [canCreate, canUpdate, canDelete] = await Promise.all([
    can('documents:create'),
    can('documents:update'),
    can('documents:delete'),
  ]);

  const [page, attachmentOptions] = await Promise.all([
    documents.listDocuments(companyId, {
      page: params.page,
      pageSize: params.pageSize,
      search: params.q || undefined,
      sort: isDocumentSortField(params.sort) ? { field: params.sort, direction: params.order } : undefined,
      types: toDocumentTypeFilters(params.status),
    }),
    documents.listAttachmentOptions(companyId),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground">
          Contracts, briefs, and deliverables, filed against the client, project, or task they belong to.
        </p>
      </header>

      <DocumentsTable
        documents={page.items}
        totalItems={page.totalItems}
        attachmentOptions={attachmentOptions}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </main>
  );
}

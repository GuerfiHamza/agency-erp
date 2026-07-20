import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { loadTableParams } from '@/lib/table/search-params';
import { ContactsTable } from '@/modules/crm/components/contacts-table';
import * as contacts from '@/modules/crm/contacts.service';
import { isContactSortField } from '@/modules/crm/contacts.validation';

export const metadata: Metadata = { title: 'Contacts' };

/**
 * The people at your clients.
 *
 * Table state is read from the URL and passed straight into SQL. The auth check
 * is here rather than in a layout — layouts do not re-run on client-side
 * navigation.
 */
export default async function ContactsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { companyId } = await requireTenantSession();

  if (!(await can('contacts:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view contacts in this workspace."
        />
      </main>
    );
  }

  const params = await loadTableParams(searchParams);

  const [canCreate, canUpdate, canDelete] = await Promise.all([
    can('contacts:create'),
    can('contacts:update'),
    can('contacts:delete'),
  ]);

  const [page, clientOptions] = await Promise.all([
    contacts.listContacts(companyId, {
      page: params.page,
      pageSize: params.pageSize,
      search: params.q || undefined,
      sort: isContactSortField(params.sort) ? { field: params.sort, direction: params.order } : undefined,
    }),
    contacts.listClientOptions(companyId),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
        <p className="text-sm text-muted-foreground">
          The people at your clients. Mark one primary per client to set the default document recipient.
        </p>
      </header>

      <ContactsTable
        contacts={page.items}
        totalItems={page.totalItems}
        clientOptions={clientOptions}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </main>
  );
}

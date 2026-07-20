import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { loadTableParams } from '@/lib/table/search-params';
import { NotificationsTable } from '@/modules/notifications/components/notifications-table';
import * as notifications from '@/modules/notifications/notifications.service';
import { toUnreadOnly } from '@/modules/notifications/notifications.validation';

export const metadata: Metadata = { title: 'Notifications' };

/**
 * A personal inbox, not a tenant list — every other Phase 5 module scopes by
 * `companyId` alone; this one also scopes by the viewer's own `userId`, so
 * `notifications:read`/`update` only ever govern a user's own rows.
 */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { companyId, userId } = await requireTenantSession();

  if (!(await can('notifications:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view notifications in this workspace."
        />
      </main>
    );
  }

  const params = await loadTableParams(searchParams);
  const canUpdate = await can('notifications:update');

  const [page, unreadCount] = await Promise.all([
    notifications.listNotifications(companyId, userId, {
      page: params.page,
      pageSize: params.pageSize,
      search: params.q || undefined,
      unreadOnly: toUnreadOnly(params.status),
    }),
    notifications.countUnread(companyId, userId),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Updates from tasks, invoices, and the rest of the workspace.
        </p>
      </header>

      <NotificationsTable
        notifications={page.items}
        totalItems={page.totalItems}
        unreadCount={unreadCount}
        canUpdate={canUpdate}
      />
    </main>
  );
}

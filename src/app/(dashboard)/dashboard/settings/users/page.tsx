import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { loadTableParams } from '@/lib/table/search-params';
import { listRolesForCompany } from '@/modules/rbac/rbac.repository';
import { InviteUserDialog } from '@/modules/users/components/invite-user-dialog';
import { PendingInvitations } from '@/modules/users/components/pending-invitations';
import { UsersTable } from '@/modules/users/components/users-table';
import * as users from '@/modules/users/users.service';
import { isUserSortField, toUserStatusFilters } from '@/modules/users/users.validation';

export const metadata: Metadata = { title: 'People' };

/**
 * The people in this company.
 *
 * Table state is read from the URL and passed straight into SQL, so a link to
 * page 3 filtered to deactivated users fetches exactly that on first paint.
 * The auth check is here rather than in a layout — layouts do not re-run on
 * client-side navigation.
 */
export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { companyId, userId } = await requireTenantSession();

  if (!(await can('users:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view the people in this workspace."
        />
      </main>
    );
  }

  const params = await loadTableParams(searchParams);

  const [canInvite, canUpdate, canDelete, canAssignRoles] = await Promise.all([
    can('users:create'),
    can('users:update'),
    can('users:delete'),
    can('roles:assign'),
  ]);

  const statuses = toUserStatusFilters(params.status);

  const [page, roles, invitations] = await Promise.all([
    users.listUsers(companyId, {
      page: params.page,
      pageSize: params.pageSize,
      search: params.q || undefined,
      // An unrecognised ?sort= falls back to the default rather than throwing:
      // a hand-edited URL should not be a 500.
      sort: isUserSortField(params.sort) ? { field: params.sort, direction: params.order } : undefined,
      statuses,
    }),
    listRolesForCompany(companyId),
    canInvite ? users.listPendingInvitations(companyId) : Promise.resolve([]),
  ]);

  const roleOptions = roles.map((role) => ({ id: role.id, name: role.name }));

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-gutter">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">People</h1>
          <p className="text-sm text-muted-foreground">
            Everyone with access to this workspace, and what they are allowed to do.
          </p>
        </div>

        {canInvite && <InviteUserDialog roleOptions={roleOptions} />}
      </header>

      {canInvite && <PendingInvitations invitations={invitations} canRevoke />}

      <UsersTable
        users={page.items}
        totalItems={page.totalItems}
        roleOptions={roleOptions}
        currentUserId={userId}
        canUpdate={canUpdate}
        canDelete={canDelete}
        canAssignRoles={canAssignRoles}
      />
    </main>
  );
}

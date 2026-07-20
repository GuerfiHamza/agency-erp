import type { Metadata } from 'next';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { RolesTable } from '@/modules/roles/components/roles-table';
import * as roles from '@/modules/roles/roles.service';

export const metadata: Metadata = { title: 'Roles' };

/**
 * The roles in this company and what each one can do.
 *
 * The auth check is here, not in a layout — layouts do not re-run on
 * client-side navigation, so a layout check passes once and is skipped forever.
 */
export default async function RolesPage() {
  const { companyId } = await requireTenantSession();

  if (!(await can('roles:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view roles in this workspace."
        />
      </main>
    );
  }

  const [canCreate, canUpdate, canDelete, list, catalogue] = await Promise.all([
    can('roles:create'),
    can('roles:update'),
    can('roles:delete'),
    roles.listRoles(companyId),
    roles.listPermissionCatalogue(),
  ]);

  // Editing and duplicating both need a role's permission slugs, which the list
  // query omits. Roles per company are few (built-ins plus a handful), so a
  // detail fetch each is fine.
  // ponytail: 1+N queries; N = role count, tiny. Fold slugs into listRoles if a
  // company ever grows hundreds of roles.
  const detailed = await Promise.all(list.map((role) => roles.getRole(companyId, role.id)));

  const rows = list.map((role, index) => ({
    ...role,
    permissionSlugs: detailed[index]?.permissionSlugs ?? [],
  }));

  const options = catalogue.map((permission) => ({
    slug: permission.slug,
    resource: permission.resource,
    action: permission.action,
  }));

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Roles</h1>
        <p className="text-sm text-muted-foreground">
          A role is a named set of permissions. People can hold several; their access is the union of all of
          them.
        </p>
      </header>

      <RolesTable
        roles={rows}
        catalogue={options}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </main>
  );
}

import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/states';
import { PERMISSIONS, RESOURCE_ACTIONS } from '@/config/permissions';
import { can, requireTenantSession } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Permissions' };

/** "time_entries" reads as a column name; "Time entries" reads as a thing. */
function humanise(resource: string): string {
  const words = resource.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The permission catalogue — every action the software can grant, grouped by
 * resource.
 *
 * Read-only and static: `config/permissions.ts` is the single source of truth
 * the seeder writes into the database, so there is nothing to fetch, mutate, or
 * validate here. No module (repository/service/actions) — the page reads the
 * config directly. The `permissions` resource only has a `read` action for the
 * same reason.
 *
 * The auth check is here, not in a layout — layouts do not re-run on
 * client-side navigation, so a layout check passes once and is skipped forever.
 */
export default async function PermissionsPage() {
  await requireTenantSession();

  if (!(await can('permissions:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view the permission catalogue in this workspace."
        />
      </main>
    );
  }

  // Keep RESOURCE_ACTIONS' insertion order rather than PERMISSIONS' flat order —
  // it groups companies/users/roles together and reads as the module list.
  const grouped = Object.keys(RESOURCE_ACTIONS).map((resource) => ({
    resource,
    actions: PERMISSIONS.filter((permission) => permission.resource === resource),
  }));

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Permissions</h1>
        <p className="text-sm text-muted-foreground">
          Every action the software can grant. Roles are built from these; this catalogue is fixed and the
          same in every workspace.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {grouped.map(({ resource, actions }) => (
          <section key={resource} className="rounded-lg border border-border p-4">
            <h2 className="text-sm font-medium">{humanise(resource)}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {actions.map((permission) => (
                <Badge key={permission.slug} variant="secondary" className="font-mono text-xs font-normal">
                  {permission.action}
                </Badge>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        {PERMISSIONS.length} permissions across {grouped.length} resources.
      </p>
    </main>
  );
}

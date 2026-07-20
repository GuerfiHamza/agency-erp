import type { Metadata } from 'next';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import { NotificationPreferencesForm } from '@/modules/settings/components/notification-preferences-form';
import * as settings from '@/modules/settings/settings.service';

export const metadata: Metadata = { title: 'Notification settings' };

/**
 * Company-wide notification defaults. Read is available to every role
 * (`settings:read`); only owner/admin can change it (`settings:update`) — the
 * same split the permission catalogue gives every other settings screen.
 */
export default async function NotificationSettingsPage() {
  const { companyId } = await requireTenantSession();

  if (!(await can('settings:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view settings in this workspace."
        />
      </main>
    );
  }

  const [canUpdate, preferences] = await Promise.all([
    can('settings:update'),
    settings.getNotificationPreferences(companyId),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Notification settings</h1>
        <p className="text-sm text-muted-foreground">
          Which notification types this workspace generates by default.
        </p>
      </header>

      <NotificationPreferencesForm preferences={preferences} canUpdate={canUpdate} />
    </main>
  );
}

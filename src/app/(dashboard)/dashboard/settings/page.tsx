import type { Metadata, Route } from 'next';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { can, requireTenantSession } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Settings' };

const SECTIONS = [
  {
    href: '/dashboard/settings/company',
    permission: 'companies:read',
    title: 'Company',
    description: 'Profile, timezone, and default currency.',
  },
  {
    href: '/dashboard/settings/users',
    permission: 'users:read',
    title: 'Users',
    description: 'Invite people and manage their access.',
  },
  {
    href: '/dashboard/settings/roles',
    permission: 'roles:read',
    title: 'Roles',
    description: 'What each role in this workspace can do.',
  },
  {
    href: '/dashboard/settings/permissions',
    permission: 'permissions:read',
    title: 'Permissions',
    description: 'The full catalogue roles are built from.',
  },
  {
    href: '/dashboard/settings/notifications',
    permission: 'settings:read',
    title: 'Notifications',
    description: 'Which notification types this workspace generates.',
  },
] as const;

/**
 * The settings index — this project has no sidebar, so this is the one place
 * that ties the five settings sub-pages together. Each card is gated by its
 * own permission and simply hidden rather than shown disabled, same posture
 * as the auth check living on the page rather than a layout.
 */
export default async function SettingsPage() {
  await requireTenantSession();

  const visibility = await Promise.all(SECTIONS.map((section) => can(section.permission)));
  const visibleSections = SECTIONS.filter((_, index) => visibility[index]);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Workspace configuration.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {visibleSections.map((section) => (
          <Link key={section.href} href={section.href as Route}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardContent className="space-y-1">
                <CardTitle>{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}

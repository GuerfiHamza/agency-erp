import {
  Activity,
  BarChart3,
  Bell,
  Bookmark,
  CalendarDays,
  Contact,
  FileClock,
  FileSignature,
  FileText,
  FolderKanban,
  Handshake,
  LayoutDashboard,
  ListChecks,
  Receipt,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import type { Route } from 'next';

import { Sidebar, type SidebarNavSection } from '@/components/layout/sidebar';
import type { PermissionSlug } from '@/config/permissions';
import { can, requireTenantSession } from '@/lib/auth/session';
import { getUserRoles } from '@/modules/rbac/rbac.service';

/**
 * The nav catalogue. One entry per built page, grouped the way the module
 * order in MEMORY.md already groups them (CRM, Delivery, Finance, ...) — this
 * is a rendering of the module list, not a separate information architecture
 * invented for the sidebar. `permission: null` (Dashboard) is always visible
 * to a signed-in tenant user; everything else is gated by that resource's
 * own `:read` permission, the same one the target page itself checks.
 */
const NAV: {
  label: string;
  items: { href: Route; label: string; icon: typeof LayoutDashboard; permission: PermissionSlug | null }[];
}[] = [
  {
    label: 'Overview',
    items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: null }],
  },
  {
    label: 'CRM',
    items: [
      { href: '/dashboard/clients', label: 'Clients', icon: Users, permission: 'clients:read' },
      { href: '/dashboard/leads', label: 'Leads', icon: Bookmark, permission: 'leads:read' },
      {
        href: '/dashboard/opportunities',
        label: 'Opportunities',
        icon: Handshake,
        permission: 'opportunities:read',
      },
      { href: '/dashboard/contacts', label: 'Contacts', icon: Contact, permission: 'contacts:read' },
      { href: '/dashboard/activities', label: 'Activities', icon: Activity, permission: 'activities:read' },
    ],
  },
  {
    label: 'Delivery',
    items: [
      { href: '/dashboard/projects', label: 'Projects', icon: FolderKanban, permission: 'projects:read' },
      { href: '/dashboard/tasks', label: 'Tasks', icon: ListChecks, permission: 'tasks:read' },
      { href: '/dashboard/documents', label: 'Documents', icon: FileText, permission: 'documents:read' },
      { href: '/dashboard/calendar', label: 'Calendar', icon: CalendarDays, permission: 'calendar:read' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/dashboard/quotes', label: 'Quotes', icon: FileSignature, permission: 'quotes:read' },
      {
        href: '/dashboard/proforma-invoices',
        label: 'Proforma invoices',
        icon: FileClock,
        permission: 'proforma_invoices:read',
      },
      { href: '/dashboard/invoices', label: 'Invoices', icon: Receipt, permission: 'invoices:read' },
      {
        href: '/dashboard/purchase-orders',
        label: 'Purchase orders',
        icon: ShoppingCart,
        permission: 'purchase_orders:read',
      },
      { href: '/dashboard/suppliers', label: 'Suppliers', icon: Truck, permission: 'suppliers:read' },
      { href: '/dashboard/payments', label: 'Payments', icon: Wallet, permission: 'payments:read' },
      { href: '/dashboard/expenses', label: 'Expenses', icon: Wallet, permission: 'expenses:read' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { href: '/dashboard/reports', label: 'Reports', icon: BarChart3, permission: 'reports:read' },
      {
        href: '/dashboard/notifications',
        label: 'Notifications',
        icon: Bell,
        permission: 'notifications:read',
      },
    ],
  },
  {
    label: 'Workspace',
    items: [{ href: '/dashboard/settings', label: 'Settings', icon: Settings, permission: 'settings:read' }],
  },
];

/**
 * Shared shell for every `/dashboard/*` page: the left nav plus a
 * left-padded content area. Scoped to this subtree (not the `(dashboard)`
 * group root) specifically so it does **not** wrap `/onboarding`, which has
 * no company yet and nothing in this nav would work for it.
 *
 * Calls `requireTenantSession`/`can` for its own purposes (building the nav),
 * not as the enforcement point — per MEMORY, layouts don't re-render on
 * client-side navigation, so every page still independently re-checks its
 * own session and permission. A stale nav item during a mid-session
 * permission change is a cosmetic gap, not a security one.
 */
export default async function DashboardShellLayout({ children }: { children: React.ReactNode }) {
  const { session } = await requireTenantSession();

  const permissions = [
    ...new Set(NAV.flatMap((section) => section.items.map((item) => item.permission))),
  ].filter((permission): permission is PermissionSlug => permission !== null);

  const [granted, roles] = await Promise.all([
    Promise.all(permissions.map((permission) => can(permission))),
    getUserRoles(session.user.id),
  ]);

  const allowed = new Set(permissions.filter((_, index) => granted[index]));

  const sections: SidebarNavSection[] = NAV.map((section) => ({
    label: section.label,
    items: section.items
      .filter((item) => item.permission === null || allowed.has(item.permission))
      // Rendered here, not passed as a bare component: a Server Component may
      // hand a Client Component an already-rendered element, never a raw
      // function reference (see the `Sidebar` note on `SidebarNavItem.icon`).
      .map((item) => ({
        href: item.href,
        label: item.label,
        icon: <item.icon className="size-4 shrink-0" aria-hidden />,
      })),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="min-h-screen">
      <Sidebar sections={sections} userName={session.user.name} roleName={roles[0]?.name ?? null} />
      <div className="pt-14 lg:pt-0 lg:pl-[280px]">{children}</div>
    </div>
  );
}

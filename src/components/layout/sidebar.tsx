'use client';

import { Menu } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { APP_NAME } from '@/config/constants';
import { cn } from '@/lib/utils';

export interface SidebarNavItem {
  href: Route;
  label: string;
  /**
   * A rendered icon element, not the icon component itself — a Server
   * Component can pass an already-rendered `ReactNode` across the
   * server/client boundary, but not a bare function reference (React errors
   * on that: "Functions cannot be passed directly to Client Components").
   * `dashboard/layout.tsx` renders each `<Icon />` before handing it here.
   */
  icon: ReactNode;
}

export interface SidebarNavSection {
  label: string;
  items: SidebarNavItem[];
}

interface Props {
  sections: SidebarNavSection[];
  userName: string;
  roleName: string | null;
}

function isActive(pathname: string, href: Route): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-2 py-4">
      <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
        {APP_NAME.charAt(0)}
      </div>
      <div>
        <p className="text-sm font-bold tracking-tight">{APP_NAME}</p>
        <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
          Enterprise
        </p>
      </div>
    </div>
  );
}

function NavSections({
  sections,
  pathname,
  onNavigate,
}: {
  sections: SidebarNavSection[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="scrollbar-hidden flex-1 space-y-4 overflow-y-auto">
      {sections.map((section) => (
        <div key={section.label}>
          <p className="px-3 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            {section.label}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all active:scale-95',
                    active
                      ? 'bg-primary/10 font-semibold text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function UserFooter({ userName, roleName }: { userName: string; roleName: string | null }) {
  return (
    <div className="border-t border-border px-2 pt-3">
      <p className="truncate text-sm font-medium">{userName}</p>
      {roleName && <p className="truncate text-xs text-muted-foreground">{roleName}</p>}
    </div>
  );
}

/**
 * The persistent left navigation for every `/dashboard/*` page.
 *
 * Client-only (needs `usePathname` for the active-link highlight and the
 * mobile drawer's open state); the *content* — which sections and items even
 * exist — is decided server-side in `dashboard/layout.tsx` by permission,
 * before this component ever sees it.
 *
 * Two renderings of the same nav, not two navs: a fixed `<aside>` at `lg:`
 * and up, and a `Sheet` drawer triggered from a mobile top bar below it —
 * the hamburger/drawer pattern deferred from the original Phase 6 pass
 * (see MEMORY, "no mobile drawer"). The drawer closes on the nav link's own
 * `onClick` (`onNavigate` below), not a `pathname`-watching effect — the
 * React Compiler's lint flags synchronous `setState` in an effect body as a
 * cascading-render risk, and the click handler already fires at the exact
 * moment intent is known, so there's nothing an effect would add.
 */
export function Sidebar({ sections, userName, roleName }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[280px] flex-col gap-1 border-r border-border p-4 glass lg:flex">
        <Brand />
        <NavSections sections={sections} pathname={pathname} />
        <UserFooter userName={userName} roleName={roleName} />
      </aside>

      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-3 backdrop-blur-xl lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="size-5" aria-hidden />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-[280px] flex-col gap-1 p-4 sm:max-w-[280px]">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">Jump to any section of {APP_NAME}</SheetDescription>
            <Brand />
            <NavSections sections={sections} pathname={pathname} onNavigate={() => setOpen(false)} />
            <UserFooter userName={userName} roleName={roleName} />
          </SheetContent>
        </Sheet>

        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
            {APP_NAME.charAt(0)}
          </div>
          <p className="text-sm font-bold tracking-tight">{APP_NAME}</p>
        </div>
      </header>
    </>
  );
}

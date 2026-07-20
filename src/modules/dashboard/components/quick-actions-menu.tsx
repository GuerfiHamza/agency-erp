'use client';

import { Bolt, FileText, FolderPlus, ListPlus, UserPlus } from 'lucide-react';
import Link from 'next/link';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  canCreateClient: boolean;
  canCreateProject: boolean;
  canCreateTask: boolean;
  canCreateInvoice: boolean;
}

/**
 * The mockup's floating action button, but real: each entry is a link to the
 * module's own create flow (that page already owns the actual form/dialog),
 * not a duplicated inline form. Hidden entirely if nothing is creatable —
 * an empty menu would be a dead button.
 */
export function QuickActionsMenu({
  canCreateClient,
  canCreateProject,
  canCreateTask,
  canCreateInvoice,
}: Props) {
  const hasAnyAction = canCreateClient || canCreateProject || canCreateTask || canCreateInvoice;

  if (!hasAnyAction) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="fixed right-8 bottom-8 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl transition-transform hover:scale-110 active:scale-95"
          aria-label="Quick actions"
        >
          <Bolt className="size-6" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top">
        {canCreateClient && (
          <DropdownMenuItem asChild>
            <Link href="/dashboard/clients">
              <UserPlus aria-hidden />
              New client
            </Link>
          </DropdownMenuItem>
        )}
        {canCreateProject && (
          <DropdownMenuItem asChild>
            <Link href="/dashboard/projects">
              <FolderPlus aria-hidden />
              New project
            </Link>
          </DropdownMenuItem>
        )}
        {canCreateTask && (
          <DropdownMenuItem asChild>
            <Link href="/dashboard/tasks">
              <ListPlus aria-hidden />
              New task
            </Link>
          </DropdownMenuItem>
        )}
        {canCreateInvoice && (
          <DropdownMenuItem asChild>
            <Link href="/dashboard/invoices">
              <FileText aria-hidden />
              New invoice
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

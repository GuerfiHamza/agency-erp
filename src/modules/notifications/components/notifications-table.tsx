'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { CheckCheck } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useMemo, useTransition } from 'react';
import { toast } from 'sonner';

import { DataTable, DataTableColumnHeader, useTableParams } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  markNotificationUnreadAction,
} from '../notifications.actions';
import type { NotificationRow } from '../notifications.service';

interface Props {
  notifications: NotificationRow[];
  totalItems: number;
  unreadCount: number;
  canUpdate: boolean;
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function humanise(type: string): string {
  return type.replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase());
}

export function NotificationsTable({ notifications, totalItems, unreadCount, canUpdate }: Props) {
  const { hasActiveFilters } = useTableParams();
  const [isPending, startTransition] = useTransition();

  function toggle(notification: NotificationRow) {
    startTransition(async () => {
      const action = notification.readAt ? markNotificationUnreadAction : markNotificationReadAction;
      const result = await action({ notificationId: notification.id });

      if (!result.success) toast.error(result.error.message);
    });
  }

  function markAllRead() {
    startTransition(async () => {
      const result = await markAllNotificationsReadAction();

      if (!result.success) toast.error(result.error.message);
    });
  }

  const columns = useMemo<ColumnDef<NotificationRow, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: () => <DataTableColumnHeader columnId="title" title="Notification" />,
        cell: ({ row }) => {
          const notification = row.original;
          const content = (
            <div className="max-w-md min-w-0">
              <div className="flex items-center gap-2">
                {!notification.readAt && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                <span className="truncate font-medium">{notification.title}</span>
              </div>
              {notification.body && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{notification.body}</p>
              )}
            </div>
          );

          return notification.linkPath ? (
            <Link href={notification.linkPath as Route} className="hover:underline">
              {content}
            </Link>
          ) : (
            content
          );
        },
      },
      {
        accessorKey: 'type',
        header: () => <DataTableColumnHeader columnId="type" title="Type" />,
        cell: ({ row }) => <Badge variant="outline">{humanise(row.original.type)}</Badge>,
      },
      {
        accessorKey: 'createdAt',
        header: () => <DataTableColumnHeader columnId="createdAt" title="Received" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {dateTimeFormatter.format(new Date(row.original.createdAt))}
          </span>
        ),
      },
      ...(canUpdate
        ? [
            {
              id: 'actions',
              header: '',
              cell: ({ row }: { row: { original: NotificationRow } }) => (
                <Button variant="ghost" size="sm" disabled={isPending} onClick={() => toggle(row.original)}>
                  {row.original.readAt ? 'Mark unread' : 'Mark read'}
                </Button>
              ),
            } satisfies ColumnDef<NotificationRow, unknown>,
          ]
        : []),
    ],
    [canUpdate, isPending],
  );

  return (
    <DataTable
      columns={columns}
      data={notifications}
      totalItems={totalItems}
      getRowId={(row) => row.id}
      searchPlaceholder="Search notifications..."
      statusOptions={[{ value: 'unread', label: 'Unread only' }]}
      hasActiveFilters={hasActiveFilters}
      emptyState={<EmptyState title="No notifications" description="You're all caught up." />}
      actions={
        canUpdate &&
        unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={isPending}>
            <CheckCheck aria-hidden />
            Mark all read ({unreadCount})
          </Button>
        )
      }
    />
  );
}

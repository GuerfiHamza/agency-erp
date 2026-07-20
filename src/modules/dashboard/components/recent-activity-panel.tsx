import { Check, Mail, MessageSquare, Phone, Users } from 'lucide-react';

import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import type { ActivityListItem } from '@/modules/crm/activities.service';

interface Props {
  activities: ActivityListItem[];
}

const TYPE_ICON = { call: Phone, email: Mail, meeting: Users, note: MessageSquare } as const;

const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function relativeLabel(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (Math.abs(diffMinutes) < 60) return relativeTime.format(diffMinutes, 'minute');

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return relativeTime.format(diffHours, 'hour');

  const diffDays = Math.round(diffHours / 24);
  return relativeTime.format(diffDays, 'day');
}

export function RecentActivityPanel({ activities }: Props) {
  if (activities.length === 0) {
    return (
      <EmptyState
        icon={Check}
        title="No activity yet"
        description="Logged calls, emails, and notes will show up here."
      />
    );
  }

  return (
    <div className="relative space-y-6 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-px before:bg-border">
      {activities.map((activity) => {
        const Icon = TYPE_ICON[activity.type];

        return (
          <div key={activity.id} className="relative pl-8">
            <div
              className={cn(
                'absolute top-0.5 left-0 z-10 flex size-[22px] items-center justify-center rounded-full border border-border bg-card',
              )}
            >
              <Icon className="size-3 text-muted-foreground" aria-hidden />
            </div>
            <p className="text-sm">
              <span className="font-medium">{activity.subject}</span>
              {activity.relatedLabel && (
                <span className="text-muted-foreground"> — {activity.relatedLabel}</span>
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {relativeLabel(new Date(activity.occurredAt))}
            </p>
          </div>
        );
      })}
    </div>
  );
}

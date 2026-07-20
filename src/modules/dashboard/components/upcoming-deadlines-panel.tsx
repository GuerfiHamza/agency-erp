import Link from 'next/link';

import { TYPE_STYLES } from '@/modules/calendar/components/month-calendar';
import type { EventListItem } from '@/modules/calendar/calendar.service';
import { EmptyState } from '@/components/ui/states';

interface Props {
  events: EventListItem[];
  timezone: string;
}

export function UpcomingDeadlinesPanel({ events, timezone }: Props) {
  if (events.length === 0) {
    return <EmptyState title="Nothing coming up" description="No events in the next two weeks." />;
  }

  const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: timezone });
  const dayFormatter = new Intl.DateTimeFormat(undefined, { day: 'numeric', timeZone: timezone });

  return (
    <div className="grid grid-cols-1 gap-3">
      {events.map((event) => {
        const startsAt = new Date(event.startsAt);

        return (
          <Link
            key={event.id}
            href="/dashboard/calendar"
            className="flex items-center justify-between rounded-xl border border-transparent bg-muted/40 p-4 transition-all hover:border-primary/20"
          >
            <div className="flex items-center gap-4">
              <div className="flex size-12 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                <span className="text-xs font-bold uppercase">{monthFormatter.format(startsAt)}</span>
                <span className="text-lg leading-none font-bold">{dayFormatter.format(startsAt)}</span>
              </div>
              <div>
                <p className="font-medium">{event.title}</p>
                {event.linkedLabel && <p className="text-xs text-muted-foreground">{event.linkedLabel}</p>}
              </div>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${TYPE_STYLES[event.type]}`}
            >
              {event.type}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

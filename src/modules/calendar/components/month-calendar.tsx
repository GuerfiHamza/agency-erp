'use client';

import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';

import { deleteEventAction } from '../calendar.actions';
import type { EventListItem } from '../calendar.service';
import { shiftMonth, toMonthParam, type EventType } from '../calendar.validation';

import { EventFormDialog, type EventLinkOptions } from './event-form-dialog';

interface Props {
  events: EventListItem[];
  /** The visible month as `YYYY-MM`. */
  month: string;
  /** The company's zone. Everything on this grid is rendered in it. */
  timezone: string;
  linkOptions: EventLinkOptions;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create'; day: Date }
  | { kind: 'edit'; event: EventListItem }
  | { kind: 'delete'; event: EventListItem };

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Six rows always: a fixed height stops the page reflowing between months. */
const CELL_COUNT = 42;

/** Shared with the dashboard's upcoming-deadlines panel — one mapping, not two. */
export const TYPE_STYLES: Record<EventType, string> = {
  meeting: 'bg-primary/15 text-primary',
  call: 'bg-success/15 text-success',
  deadline: 'bg-destructive/15 text-destructive',
  reminder: 'bg-warning/15 text-warning',
  other: 'bg-muted text-muted-foreground',
};

/**
 * `en-CA` is the shortest way to a `YYYY-MM-DD` key, and it is what makes this
 * grid deterministic: the server and the browser bucket events with the *same*
 * zone, so there is no hydration mismatch from their clocks disagreeing.
 */
function dayKeyFormatter(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function MonthCalendar({
  events,
  month,
  timezone,
  linkOptions,
  canCreate,
  canUpdate,
  canDelete,
}: Props) {
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });

  const close = () => setDialog({ kind: 'none' });

  const { cells, heading, todayKey, byDay, timeFormatter } = useMemo(() => {
    const [year, monthNumber] = month.split('-').map(Number);
    const monthIndex = (monthNumber ?? 1) - 1;

    const keyOf = dayKeyFormatter(timezone);
    const times = new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
    });

    // The grid skeleton is pure calendar arithmetic — "July 2026" has the same
    // shape everywhere on earth — so it is built in UTC and only the *events*
    // are placed using the company's zone.
    const first = new Date(Date.UTC(year ?? 1970, monthIndex, 1));
    const offsetToMonday = (first.getUTCDay() + 6) % 7;

    const days = Array.from({ length: CELL_COUNT }, (_, index) => {
      const date = new Date(Date.UTC(year ?? 1970, monthIndex, 1 - offsetToMonday + index));

      return {
        date,
        key: keyOf.format(date),
        dayOfMonth: date.getUTCDate(),
        inMonth: date.getUTCMonth() === monthIndex,
      };
    });

    const grouped = new Map<string, EventListItem[]>();

    for (const event of events) {
      const key = keyOf.format(new Date(event.startsAt));
      const bucket = grouped.get(key);

      if (bucket) bucket.push(event);
      else grouped.set(key, [event]);
    }

    return {
      cells: days,
      byDay: grouped,
      todayKey: keyOf.format(new Date()),
      timeFormatter: times,
      heading: new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        first,
      ),
    };
  }, [events, month, timezone]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-8" asChild>
            <Link href={`?month=${shiftMonth(month, -1)}`} aria-label="Previous month">
              <ChevronLeft aria-hidden />
            </Link>
          </Button>
          <Button variant="outline" size="icon" className="size-8" asChild>
            <Link href={`?month=${shiftMonth(month, 1)}`} aria-label="Next month">
              <ChevronRight aria-hidden />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`?month=${toMonthParam(new Date())}`}>Today</Link>
          </Button>

          <h2 className="ml-2 text-lg font-semibold tracking-tight">{heading}</h2>
        </div>

        {canCreate && (
          <Button size="sm" onClick={() => setDialog({ kind: 'create', day: new Date() })}>
            <Plus aria-hidden />
            New event
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">Times shown in {timezone}.</p>

      <div className="overflow-hidden rounded-lg border border-border glass">
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
              {weekday}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const dayEvents = byDay.get(cell.key) ?? [];

            return (
              <div
                key={cell.key}
                className={cn(
                  'group/day min-h-24 space-y-1 border-t border-r border-border p-1.5 last:border-r-0',
                  !cell.inMonth && 'bg-muted/30',
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'text-xs',
                      cell.inMonth ? 'text-foreground' : 'text-muted-foreground',
                      cell.key === todayKey &&
                        'flex size-5 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground',
                    )}
                  >
                    {cell.dayOfMonth}
                  </span>

                  {canCreate && (
                    <button
                      type="button"
                      onClick={() => setDialog({ kind: 'create', day: cell.date })}
                      className="rounded text-muted-foreground opacity-0 transition-opacity group-hover/day:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none"
                      aria-label={`Add an event on ${cell.key}`}
                    >
                      <Plus className="size-3.5" aria-hidden />
                    </button>
                  )}
                </div>

                {dayEvents.map((event) => (
                  <div key={event.id} className="group/event flex items-center gap-0.5">
                    <button
                      type="button"
                      disabled={!canUpdate}
                      onClick={() => setDialog({ kind: 'edit', event })}
                      className={cn(
                        'min-w-0 flex-1 truncate rounded px-1.5 py-0.5 text-left text-xs',
                        TYPE_STYLES[event.type],
                        canUpdate ? 'hover:opacity-80' : 'cursor-default',
                      )}
                      title={event.linkedLabel ? `${event.title} — ${event.linkedLabel}` : event.title}
                    >
                      {!event.isAllDay && (
                        <span className="font-mono opacity-70">
                          {timeFormatter.format(new Date(event.startsAt))}{' '}
                        </span>
                      )}
                      {event.title}
                    </button>

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setDialog({ kind: 'delete', event })}
                        className="shrink-0 rounded text-muted-foreground opacity-0 group-hover/event:opacity-100 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none"
                        aria-label={`Delete ${event.title}`}
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {dialog.kind === 'create' && (
        <EventFormDialog defaultDate={dialog.day} linkOptions={linkOptions} open onOpenChange={close} />
      )}

      {dialog.kind === 'edit' && (
        <EventFormDialog event={dialog.event} linkOptions={linkOptions} open onOpenChange={close} />
      )}

      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={`Delete ${dialog.event.title}?`}
          description="The event is removed from the calendar."
          confirmLabel="Delete"
          successMessage="Event deleted."
          onConfirm={() => deleteEventAction({ eventId: dialog.event.id })}
        />
      )}
    </>
  );
}

import {
  boolean,
  index,
  pgTable,
  primaryKey as compositeKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, softDelete, timestamps } from './_shared';
import { user } from './auth';
import { clients } from './clients';
import { companies } from './companies';
import { attendeeStatusEnum, eventTypeEnum } from './enums';
import { projects } from './projects';
import { tasks } from './tasks';

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    title: text('title').notNull(),
    description: text('description'),
    location: text('location'),
    type: eventTypeEnum('type').notNull().default('meeting'),

    /**
     * Stored with time zone; the display zone comes from the company/user
     * setting. All-day events set `isAllDay` and are interpreted in that zone.
     */
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    isAllDay: boolean('is_all_day').notNull().default(false),

    /**
     * RFC 5545 RRULE (e.g. "FREQ=WEEKLY;BYDAY=MO"). Stored as text and expanded
     * at read time rather than materialising every occurrence as a row.
     */
    recurrenceRule: text('recurrence_rule'),

    // Optional links, same rationale as documents: real FKs over a polymorphic pair.
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),

    createdById: uuid('created_by_id').references(() => user.id, { onDelete: 'set null' }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index('calendar_events_company_id_idx').on(table.companyId),
    // The range scan behind every calendar view.
    index('calendar_events_starts_at_idx').on(table.companyId, table.startsAt),
    index('calendar_events_project_id_idx').on(table.projectId),
    index('calendar_events_client_id_idx').on(table.clientId),
    index('calendar_events_deleted_at_idx').on(table.deletedAt),
  ],
);

export const eventAttendees = pgTable(
  'event_attendees',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => calendarEvents.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: attendeeStatusEnum('status').notNull().default('invited'),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    compositeKey({ columns: [table.eventId, table.userId] }),
    index('event_attendees_user_id_idx').on(table.userId),
  ],
);

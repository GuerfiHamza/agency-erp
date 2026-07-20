import type { Metadata } from 'next';

import { ErrorState } from '@/components/ui/states';
import { can, requireTenantSession } from '@/lib/auth/session';
import * as calendar from '@/modules/calendar/calendar.service';
import { monthRange } from '@/modules/calendar/calendar.validation';
import { MonthCalendar } from '@/modules/calendar/components/month-calendar';
import * as companies from '@/modules/companies/companies.service';

export const metadata: Metadata = { title: 'Calendar' };

/**
 * The month view.
 *
 * No DataTable here, deliberately: a calendar is a grid of days, and events in a
 * month are tens, so paging, sorting, and search would be dead flexibility. The
 * only state is `?month=YYYY-MM`, which keeps the view shareable and the back
 * button honest.
 */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { companyId } = await requireTenantSession();

  if (!(await can('calendar:read'))) {
    return (
      <main className="p-gutter">
        <ErrorState
          title="No access"
          description="You do not have permission to view the calendar in this workspace."
        />
      </main>
    );
  }

  const { month, from, to } = monthRange((await searchParams).month ?? null);

  const [canCreate, canUpdate, canDelete] = await Promise.all([
    can('calendar:create'),
    can('calendar:update'),
    can('calendar:delete'),
  ]);

  const [events, linkOptions, company] = await Promise.all([
    calendar.listEventsInRange(companyId, from, to),
    calendar.listLinkOptions(companyId),
    companies.getCompany(companyId),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 p-gutter">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          Meetings, calls, and deadlines, linked to the client, project, or task they belong to.
        </p>
      </header>

      <MonthCalendar
        events={events}
        month={month}
        timezone={company.timezone}
        linkOptions={linkOptions}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </main>
  );
}

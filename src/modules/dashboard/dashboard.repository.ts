import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '@/db';
import { projects, tasks } from '@/db/schema';

/**
 * Dashboard data access. Queries `projects` and `tasks` directly rather than
 * through their own modules' services — the same cross-cutting-aggregate
 * posture Reports takes, not a tenant-guarded single-record lookup. Revenue,
 * invoice aging, recent activity, and upcoming deadlines are composed from
 * the Reports/Activities/Calendar *services* directly in the dashboard page
 * instead — there was nothing left to add here for those.
 */

export interface ActiveProjectRow {
  id: string;
  code: string;
  name: string;
  endDate: Date | null;
  totalTasks: number;
  completedTasks: number;
}

/**
 * The active-project count plus the `limit` soonest-due ones, each with a
 * task completion count. Two single-table queries merged in JS — the same
 * shape Reports' `project_profitability` uses — rather than one join, which
 * would put `projects` and `tasks` (both with a bare `id`/`status` column) in
 * the same `sql` scope and risk the unqualified-column trap a raw fragment
 * hits in that situation.
 */
export async function getActiveProjectsOverview(
  companyId: string,
  limit: number,
): Promise<{ activeCount: number; rows: ActiveProjectRow[] }> {
  const activeProjects = await db
    .select({ id: projects.id, code: projects.code, name: projects.name, endDate: projects.endDate })
    .from(projects)
    .where(and(eq(projects.companyId, companyId), eq(projects.status, 'active'), isNull(projects.deletedAt)))
    // Soonest deadline first — nulls (no end date) sort last.
    .orderBy(sql`${projects.endDate} asc nulls last`, asc(projects.id));

  if (activeProjects.length === 0) return { activeCount: 0, rows: [] };

  const topProjects = activeProjects.slice(0, limit);
  const projectIds = topProjects.map((project) => project.id);

  const taskCounts = await db
    .select({
      projectId: tasks.projectId,
      totalTasks: sql<number>`count(*)::int`,
      completedTasks: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.companyId, companyId),
        isNull(tasks.deletedAt),
        inArray(tasks.projectId, projectIds),
        sql`${tasks.status} != 'cancelled'`,
      ),
    )
    .groupBy(tasks.projectId);

  const countsByProject = new Map(taskCounts.map((row) => [row.projectId, row]));

  const rows = topProjects.map((project) => {
    const counts = countsByProject.get(project.id);

    return {
      ...project,
      totalTasks: counts?.totalTasks ?? 0,
      completedTasks: counts?.completedTasks ?? 0,
    };
  });

  return { activeCount: activeProjects.length, rows };
}

export interface TaskWorkload {
  openCount: number;
  totalCount: number;
}

/** Open vs. total live tasks company-wide, excluding cancelled ones from both sides. */
export async function getTaskWorkload(companyId: string): Promise<TaskWorkload> {
  const [row] = await db
    .select({
      openCount: sql<number>`count(*) filter (where ${tasks.status} != 'done')::int`,
      totalCount: sql<number>`count(*)::int`,
    })
    .from(tasks)
    .where(and(eq(tasks.companyId, companyId), isNull(tasks.deletedAt), sql`${tasks.status} != 'cancelled'`));

  return { openCount: row?.openCount ?? 0, totalCount: row?.totalCount ?? 0 };
}

import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { companies, projects, tasks } from '@/db/schema';

import * as service from './dashboard.service';

/**
 * Against the real Postgres. Pins the merge-in-JS join between `projects` and
 * `tasks` (the same "two single-table queries, not one join" posture Reports'
 * `project_profitability` takes, to sidestep the bare-unqualified-column trap
 * a raw `sql` fragment hits when two joined tables share a column name), the
 * active-only/cancelled-excluded filters, and the workload counts.
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG = 'vitest-dashboard';

async function cleanup() {
  await db.delete(companies).where(eq(companies.slug, SLUG));
}

beforeEach(cleanup);
afterAll(cleanup);

async function fixture() {
  const [company] = await db.insert(companies).values({ name: 'Vitest Co', slug: SLUG }).returning();
  if (!company) throw new Error('fixture company failed');

  return company;
}

describe('getActiveProjectsOverview', () => {
  it('counts active projects and reports task completion for the top N', async () => {
    const company = await fixture();

    const [active, planning] = await db
      .insert(projects)
      .values([
        { companyId: company.id, name: 'Active One', code: 'PRJ-DASH-1', status: 'active' },
        { companyId: company.id, name: 'Still Planning', code: 'PRJ-DASH-2', status: 'planning' },
      ])
      .returning();

    if (!active || !planning) throw new Error('fixture projects failed');

    await db.insert(tasks).values([
      { companyId: company.id, projectId: active.id, title: 'Done task', status: 'done' },
      { companyId: company.id, projectId: active.id, title: 'Open task', status: 'todo' },
      // A cancelled task on the active project must not count toward either total.
      { companyId: company.id, projectId: active.id, title: 'Cancelled task', status: 'cancelled' },
    ]);

    const overview = await service.getActiveProjectsOverview(company.id, 4);

    expect(overview.activeCount).toBe(1);
    expect(overview.rows).toEqual([
      expect.objectContaining({ id: active.id, totalTasks: 2, completedTasks: 1 }),
    ]);
  });

  it('returns an empty overview when there are no active projects', async () => {
    const company = await fixture();

    const overview = await service.getActiveProjectsOverview(company.id, 4);

    expect(overview).toEqual({ activeCount: 0, rows: [] });
  });
});

describe('getTaskWorkload', () => {
  it('counts open vs. total live tasks, excluding cancelled from both', async () => {
    const company = await fixture();
    const [project] = await db
      .insert(projects)
      .values({ companyId: company.id, name: 'Website', code: 'PRJ-DASH-3' })
      .returning();
    if (!project) throw new Error('fixture project failed');

    await db.insert(tasks).values([
      { companyId: company.id, projectId: project.id, title: 'Done', status: 'done' },
      { companyId: company.id, projectId: project.id, title: 'In progress', status: 'in_progress' },
      { companyId: company.id, projectId: project.id, title: 'Todo', status: 'todo' },
      { companyId: company.id, projectId: project.id, title: 'Cancelled', status: 'cancelled' },
    ]);

    const workload = await service.getTaskWorkload(company.id);

    expect(workload).toEqual({ openCount: 2, totalCount: 3 });
  });
});

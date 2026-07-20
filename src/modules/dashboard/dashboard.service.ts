import 'server-only';

import * as repository from './dashboard.repository';

export type { ActiveProjectRow, TaskWorkload } from './dashboard.repository';

/**
 * Dashboard rules — there aren't many, because this module only reads. No
 * `create`/`update`/`delete`, and no permission of its own: each widget is
 * gated by the permission of the resource it shows (`reports:read`,
 * `invoices:read`, `projects:read`, `tasks:read`, `activities:read`,
 * `calendar:read`), decided by the page, not here.
 */

export async function getActiveProjectsOverview(companyId: string, limit = 4) {
  return repository.getActiveProjectsOverview(companyId, limit);
}

export async function getTaskWorkload(companyId: string) {
  return repository.getTaskWorkload(companyId);
}

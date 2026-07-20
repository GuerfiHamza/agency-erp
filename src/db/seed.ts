import 'dotenv/config';

import { provisionSystemRoles, syncPermissionCatalogue } from '@/modules/rbac/rbac.provisioning';

import { closeDatabaseConnection } from './index';
import { log, seedDemoAdmin, seedDemoCompany } from './seed-helpers';

/**
 * Database seeder.
 *
 * Every step is idempotent: running this twice must leave the same state as
 * running it once. A seeder that only works on an empty database is a seeder
 * nobody dares run, so all writes are upserts or guarded by a lookup.
 *
 *   npm run db:seed
 *
 * The permission catalogue and role provisioning come from
 * `modules/rbac/rbac.provisioning`, which registration also uses. That sharing
 * is the point: a company created through sign-up and one created here must end
 * up with identical roles, and two copies of this logic would drift.
 *
 * Demo company and admin are skipped in production — see `bootstrap-admin.ts`
 * for the one-time production path that intentionally does create them.
 */

async function main(): Promise<void> {
  log('Seeding database...');

  const count = await syncPermissionCatalogue();
  log(`  permissions: ${count} upserted`);

  // Demo data must never reach a production database.
  if (process.env.NODE_ENV === 'production') {
    log('Production environment - skipping demo data.');
    return;
  }

  const companyId = await seedDemoCompany();

  for (const role of await provisionSystemRoles(companyId)) {
    log(`  role ${role.slug}: ${role.granted} permissions (${role.revoked} revoked)`);
  }

  await seedDemoAdmin(companyId);

  log('Seed complete.');
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`Seed failed: ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => closeDatabaseConnection());

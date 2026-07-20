import 'dotenv/config';

import { provisionSystemRoles } from '@/modules/rbac/rbac.provisioning';

import { closeDatabaseConnection } from './index';
import { log, seedDemoAdmin, seedDemoCompany } from './seed-helpers';

/**
 * One-time production bootstrap: creates the company + owner account `npm run
 * db:seed` deliberately refuses to create once `NODE_ENV=production` (seeding
 * demo data into a real production database is the wrong default). For this
 * app specifically that gate doesn't apply to the very first run — the seeded
 * company IS the one real company this single-tenant deployment is built
 * around (see MEMORY.md, "Single-tenant lockdown"), and there is no other way
 * to get a first account in: sign-up is disabled, and invitations require an
 * existing admin. Requires `SEED_ADMIN_PASSWORD` in the environment, same as
 * the seeder. Safe to run again later — every step here is idempotent.
 *
 *   SEED_ADMIN_PASSWORD='...' npx tsx src/db/bootstrap-admin.ts
 */

async function main(): Promise<void> {
  log('Bootstrapping production company + admin...');

  const companyId = await seedDemoCompany();

  for (const role of await provisionSystemRoles(companyId)) {
    log(`  role ${role.slug}: ${role.granted} permissions (${role.revoked} revoked)`);
  }

  await seedDemoAdmin(companyId);

  log('Bootstrap complete.');
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`Bootstrap failed: ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => closeDatabaseConnection());

import { hashPassword } from 'better-auth/crypto';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from './index';
import { account, companies, roles, user, userRoles } from './schema';

/**
 * Shared by `seed.ts` (`npm run db:seed`) and `bootstrap-admin.ts` (the
 * production first-run bootstrap) — pure functions, no top-level side
 * effects. Both scripts call `main()` at module scope, so importing FROM one
 * script INTO the other would re-run its side effects too (this bit once:
 * bootstrap-admin originally imported straight from seed.ts and ended up
 * racing two `main()` runs over the same DB pool). Keeping the reusable logic
 * here, with no script wired to run on import, is what avoids that.
 */

export const DEMO_COMPANY_SLUG = 'neodott';
export const DEMO_ADMIN_EMAIL = 'admin@neodott.test';

/** Runs outside Next.js, so stdout is the only sink here. */
export const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

/** Create the demo company if absent. */
export async function seedDemoCompany(): Promise<string> {
  const existing = await db.query.companies.findFirst({
    where: and(eq(companies.slug, DEMO_COMPANY_SLUG), isNull(companies.deletedAt)),
  });

  if (existing) {
    log(`  company ${DEMO_COMPANY_SLUG}: exists`);
    return existing.id;
  }

  const [created] = await db
    .insert(companies)
    .values({
      name: 'NEODOTT',
      slug: DEMO_COMPANY_SLUG,
      legalName: 'NEODOTT',
      email: 'hello@neodott.test',
      defaultCurrency: 'DZD',
      timezone: 'UTC',
      status: 'active',
    })
    .returning({ id: companies.id });

  log(`  company ${DEMO_COMPANY_SLUG}: created`);
  return created!.id;
}

async function assignOwnerRole(userId: string, companyId: string): Promise<void> {
  const ownerRole = await db.query.roles.findFirst({
    where: and(eq(roles.companyId, companyId), eq(roles.slug, 'owner'), isNull(roles.deletedAt)),
  });

  if (!ownerRole) return;

  await db.insert(userRoles).values({ userId, roleId: ownerRole.id }).onConflictDoNothing();
}

/**
 * Create the demo admin.
 *
 * Inserts `user` + `account` directly — the same shape `acceptInvitation`
 * uses (`providerId: 'credential'`, `accountId = user.id`, a password hashed
 * by `better-auth/crypto`'s exported `hashPassword`), not
 * `auth.api.signUpEmail`. Going through Better Auth's API used to be the
 * safer choice (a hand-inserted user with the wrong shape can't sign in),
 * but the single-tenant lockdown's `emailAndPassword.disableSignUp: true`
 * now makes `signUpEmail` throw unconditionally — including from this
 * seeder — so a fresh `db:seed` could no longer create an admin at all.
 * `acceptInvitation`'s shape is exercised by every real invited user in this
 * app; reusing it here removes the seeder's only dependency on sign-up being
 * enabled. Verified by signing in with a seeded admin afterward.
 */
export async function seedDemoAdmin(companyId: string): Promise<void> {
  const existing = await db.query.user.findFirst({
    where: and(eq(user.email, DEMO_ADMIN_EMAIL), isNull(user.deletedAt)),
  });

  if (existing) {
    log(`  admin ${DEMO_ADMIN_EMAIL}: exists`);
    await assignOwnerRole(existing.id, companyId);
    return;
  }

  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!password) {
    log('  admin: skipped (set SEED_ADMIN_PASSWORD to create one)');
    return;
  }

  const passwordHash = await hashPassword(password);

  const createdId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(user)
      .values({
        name: 'Neodott Admin',
        email: DEMO_ADMIN_EMAIL,
        // Marked verified directly: the demo admin has no inbox to click a
        // link in, and an unverifiable seeded account cannot sign in now
        // that verification is required.
        emailVerified: true,
        companyId,
        isActive: true,
      })
      .returning({ id: user.id });

    if (!created) throw new Error('admin user insert returned no row');

    await tx.insert(account).values({
      userId: created.id,
      providerId: 'credential',
      accountId: created.id,
      password: passwordHash,
    });

    return created.id;
  });

  await assignOwnerRole(createdId, companyId);
  log(`  admin ${DEMO_ADMIN_EMAIL}: created (verified)`);
}

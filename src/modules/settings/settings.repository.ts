import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { settings } from '@/db/schema';

/**
 * Settings data access. The only place in the module that touches Drizzle.
 *
 * Only ever reads/writes `scope = 'company'` rows (`userId IS NULL`) — see the
 * validation module note on why per-user overrides are not wired yet.
 */

export async function getCompanySetting(companyId: string, key: string): Promise<unknown | null> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.companyId, companyId), eq(settings.key, key), isNull(settings.userId)))
    .limit(1);

  return row?.value ?? null;
}

/**
 * Insert-or-update by hand rather than `onConflictDoUpdate` against the
 * partial unique index (`settings_company_key_unique`, `WHERE user_id IS
 * NULL`) — this is an occasional admin toggle, not a hot path, so the
 * read-then-write is simpler than matching Postgres's `ON CONFLICT ...
 * WHERE` syntax to the index predicate.
 *
 * ponytail: two concurrent writes for the same never-yet-set key could both
 * see "no existing row" and both insert, tripping the unique index on the
 * second. Not worth a transaction for an owner/admin toggling their own
 * company's settings.
 */
export async function upsertCompanySetting(companyId: string, key: string, value: unknown): Promise<void> {
  const [existing] = await db
    .select({ id: settings.id })
    .from(settings)
    .where(and(eq(settings.companyId, companyId), eq(settings.key, key), isNull(settings.userId)))
    .limit(1);

  if (existing) {
    await db.update(settings).set({ value }).where(eq(settings.id, existing.id));
  } else {
    await db.insert(settings).values({ companyId, scope: 'company', key, value });
  }
}

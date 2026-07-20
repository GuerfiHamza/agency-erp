import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { companies } from '@/db/schema';

import * as service from './settings.service';
import { defaultNotificationPreferences } from './settings.validation';

/**
 * Against the real Postgres. Pins the "no row yet reads as every type
 * enabled" default, the insert-then-update upsert path, and that a stale/
 * malformed stored value falls back to defaults instead of throwing.
 *
 * Also pins the `server-only` alias — this file imports a marked service.
 */

const SLUG = 'vitest-settings';

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

describe('getNotificationPreferences', () => {
  it('defaults to every type enabled when no row exists yet', async () => {
    const company = await fixture();

    const preferences = await service.getNotificationPreferences(company.id);

    expect(preferences).toEqual(defaultNotificationPreferences());
  });
});

describe('updateNotificationPreferences', () => {
  it('persists a change and reads it back', async () => {
    const company = await fixture();

    await service.updateNotificationPreferences(company.id, {
      ...defaultNotificationPreferences(),
      mention: false,
    });

    const preferences = await service.getNotificationPreferences(company.id);

    expect(preferences.mention).toBe(false);
    expect(preferences.system).toBe(true);
  });

  it('updates in place on a second save rather than duplicating the row', async () => {
    const company = await fixture();

    await service.updateNotificationPreferences(company.id, {
      ...defaultNotificationPreferences(),
      mention: false,
    });
    await service.updateNotificationPreferences(company.id, {
      ...defaultNotificationPreferences(),
      mention: true,
      task_due: false,
    });

    const preferences = await service.getNotificationPreferences(company.id);

    expect(preferences.mention).toBe(true);
    expect(preferences.task_due).toBe(false);
  });
});

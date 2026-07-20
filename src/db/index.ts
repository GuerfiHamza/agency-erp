import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { serverEnv, isProduction } from '@/config/env';
import { logger } from '@/lib/logger';

import * as schema from './schema';

/**
 * PostgreSQL connection and Drizzle client.
 *
 * Access to the database is confined to repositories (Phase 5). Services and UI
 * must not import this module directly.
 */

export type Database = NodePgDatabase<typeof schema>;

function createPool(): Pool {
  const pool = new Pool({
    connectionString: serverEnv.DATABASE_URL,
    max: serverEnv.DB_POOL_MAX ?? (isProduction() ? 20 : 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // An idle client erroring (network drop, server restart) emits on the pool.
  // Without a listener, Node treats it as an unhandled 'error' event and exits.
  pool.on('error', (error) => {
    logger.error('Unexpected error on idle database client', { error });
  });

  return pool;
}

/**
 * `next dev` re-evaluates modules on every hot reload. Without caching on
 * globalThis, each reload opens a new pool and the connection limit is reached
 * within minutes.
 */
const globalForDb = globalThis as unknown as {
  __dbPool?: Pool;
  __db?: Database;
};

const pool: Pool = globalForDb.__dbPool ?? createPool();
export const db: Database = globalForDb.__db ?? drizzle(pool, { schema, casing: 'snake_case' });

if (!isProduction()) {
  globalForDb.__dbPool = pool;
  globalForDb.__db = db;
}

/** Verify the database is reachable. Used by the health check and instrumentation. */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Database connection check failed', { error });
    return false;
  }
}

/** Close the pool. For graceful shutdown and test teardown only. */
export async function closeDatabaseConnection(): Promise<void> {
  await pool.end();
}

export { schema };

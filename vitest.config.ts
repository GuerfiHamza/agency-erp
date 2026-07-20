import { fileURLToPath } from 'node:url';

import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

/**
 * Tests run against the real Postgres from docker-compose, not a mock.
 *
 * The repository layer is mostly SQL — partial unique indexes, soft-delete
 * filters, `numeric` returning strings, cascade rules. A mocked driver would
 * assert that we called it the way we thought we did, which is the one thing
 * never in doubt. See MEMORY.md, "Schema conventions".
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    // `dotenv/config` supplies DATABASE_URL and BETTER_AUTH_SECRET, exactly as
    // it does for the seeder. No separate test env file to drift out of sync.
    setupFiles: ['dotenv/config'],
    include: ['src/**/*.test.ts'],
    // Suites share one database. Running files in parallel would let one
    // module's truncate delete another's fixtures mid-assertion.
    fileParallelism: false,
  },
});

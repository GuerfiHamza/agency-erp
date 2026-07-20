import 'dotenv/config';

import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit runs outside the Next.js runtime, so it does not get Next's
 * automatic `.env` loading — hence the explicit `dotenv/config` import above.
 * See `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`.
 */

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});

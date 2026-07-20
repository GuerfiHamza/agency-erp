# Nexus Agency ERP

Enterprise agency resource planning. Next.js 16 (App Router), TypeScript strict, Drizzle ORM + PostgreSQL, Better Auth, Tailwind CSS v4, shadcn/ui.

> **Next.js 16, not 15.** Middleware is renamed to Proxy, `cookies`/`headers`/`params` are async-only, Turbopack is the default builder, and `next lint` is gone. Read the relevant guide in `node_modules/next/dist/docs/` before writing code — see `AGENTS.md`.

## Getting started

Requires Node 20.9+ (Next 16 floor) and Docker.

```bash
cp .env.example .env          # then set BETTER_AUTH_SECRET: openssl rand -base64 32
npm install
npm run db:up                 # starts PostgreSQL in Docker
npm run db:migrate            # applies migrations
npm run dev                   # http://localhost:3000
```

## Scripts

| Script                | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `npm run dev`         | Dev server (Turbopack)                               |
| `npm run build`       | Production build                                     |
| `npm run verify`      | Typecheck + lint + format check — run before commits |
| `npm run typecheck`   | `tsc --noEmit`                                       |
| `npm run lint`        | ESLint (flat config)                                 |
| `npm run format`      | Prettier write                                       |
| `npm run db:up`       | Start PostgreSQL                                     |
| `npm run db:generate` | Generate a migration from schema changes             |
| `npm run db:migrate`  | Apply migrations                                     |
| `npm run db:seed`     | Seed permissions, roles, and demo data (idempotent)  |
| `npm run db:studio`   | Drizzle Studio                                       |

## Architecture

Business logic stays out of UI. Data flows one direction:

```
app/ + components/   delivery — render, collect input
      ↓
services             orchestration, authorization, business rules
      ↓
repositories         the only layer that touches Drizzle
      ↓
db/                  pool + schema
```

ESLint enforces the boundary: importing `@/db` or `drizzle-orm` from a component or page fails the build.

```
src/
  app/          App Router routes; api/auth/[...all] is the Better Auth handler
    (auth)/     signed-out pages
    (dashboard)/ signed-in pages
  components/
    providers/  cross-cutting context providers
    ui/         shadcn/ui primitives
  config/       env.ts (validated), constants.ts, permissions.ts (the catalogue)
  db/           client + schema/ + seed.ts
  lib/          auth/, errors.ts, logger.ts, helpers.ts, utils.ts
  modules/      one folder per feature: validation, service, repository, actions, components
  types/        cross-module types (Result, pagination)
  instrumentation.ts   validates env at server start
  proxy.ts      optimistic route gate (Next 16's renamed middleware)
```

## Authentication & authorization

Three layers, and only one of them is a security boundary:

1. **`src/proxy.ts`** — optimistic only. Checks for the _presence_ of a session cookie to keep
   signed-out visitors off protected URLs. It never reads the database and never trusts the cookie's
   contents, because it runs on every request including prefetches. **Not a security boundary.**
2. **`src/lib/auth/session.ts`** — the Data Access Layer, and where auth is actually enforced. Every
   page and action calls `requireSession` / `requireTenantSession` / `requirePermission`. Sessions
   are validated against the database on every request (the Better Auth cookie cache is deliberately
   off, so revoking access takes effect immediately). Deactivated users (`isActive = false`) are
   treated as signed out here — the single chokepoint, rather than a check each page must remember.
3. **Server Actions** — public HTTP endpoints. Every one re-validates its input with Zod and
   re-checks permissions server-side. Hiding a button protects nothing.

Auth checks live in **pages, not layouts**: layouts don't re-render on client-side navigation
(Partial Rendering), so a check there passes once and is skipped thereafter.

Permissions are `resource:action` strings from `src/config/permissions.ts`, and the `PermissionSlug`
type is derived from that catalogue — so `requirePermission('invoices:delte')` fails to compile
rather than silently denying forever. A user's effective permissions are the union across their
roles, memoized per request with React `cache`.

## Database

36 tables across the 20 ERP modules. Conventions that apply everywhere:

- **UUID keys.** Every id is `uuid DEFAULT gen_random_uuid()`, including Better Auth's. This is
  load-bearing for auth: with `advanced.database.generateId: "uuid"` and a pg adapter, Better Auth
  sends no id and relies on that database default.
- **Tenancy.** Every business table carries `company_id` and cascades from `companies`. Every query
  must scope by it.
- **Soft delete.** `deleted_at IS NULL` means live. Reads must filter it, and uniques on
  soft-deletable tables are **partial indexes over live rows** — otherwise a deleted row would
  squat on its email or invoice number forever.
- **Money.** `numeric(14,2)`, returned by Drizzle as a **string**. Never parse it into a JS number
  for arithmetic; binary floats cannot represent `0.10`.
- **Deletes.** `cascade` for owned children, `set null` for people (losing an employee must not
  delete a client), `restrict` for issued financial documents.

Seeding is idempotent — safe to re-run. It upserts the permission catalogue from
`src/config/permissions.ts` (the single source shared with Phase 3's authorization) and revokes
grants removed from a role definition. The demo company and admin are skipped when
`NODE_ENV=production`; the admin is only created when `SEED_ADMIN_PASSWORD` is set, and is created
through Better Auth's API so the password is hashed by the real sign-up path.

## Environment

`src/config/env.ts` validates every variable with Zod. The server refuses to boot on an invalid
config rather than failing on the first request. `.env` files live in the project root, never in
`src/`.

`SKIP_ENV_VALIDATION=1` bypasses validation during `next build` only — real secrets do not exist at
image build time. `instrumentation.ts` still validates at container start.

## Docker

```bash
docker compose --profile production up --build app   # production image
```

The image uses Next's `standalone` output and runs as a non-root user.

## Design

Tokens in `src/app/globals.css` are adapted from the Stitch mockup (`F.TXT`), a Material Design 3
dark palette collapsed into shadcn/ui's semantic set. The `glass` utility carries the mockup's
signature blurred surface; apply it to panels, not to every row in a list — `backdrop-filter` is
expensive. Light and dark themes are both supported.

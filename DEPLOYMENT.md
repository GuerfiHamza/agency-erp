# Deploying to cPanel shared hosting (via GitHub)

This app is a Next.js 16 server (not a static site) with a PostgreSQL database. It needs:

- A cPanel plan with **"Setup Node.js App"** (Node 20.9+; the app is built and tested on Node 22)
- A **PostgreSQL** database (checked: your host has this via cPanel's "PostgreSQL Databases" tool —
  most shared cPanel hosts only offer MySQL, so this is worth double-checking before you start)
- SSH/Terminal access in cPanel (bundled with Node.js Selector on almost every host that offers it —
  check for a "Terminal" icon under Advanced)

Read this whole document once before starting — the steps depend on each other, and #2 (Postgres
version check) can block everything downstream if skipped.

---

## 0. Before you push to GitHub

Nothing to do — `.gitignore` already excludes `node_modules`, `.next`, `.env*`, and `.storage`. Push
the repo as-is:

```bash
git add -A
git commit -m "Prepare for cPanel deployment"
git push origin main
```

Never commit a `.env` file. Secrets go into cPanel's Node.js App environment-variable editor (step 5),
not into git.

---

## 1. Create the PostgreSQL database in cPanel

**cPanel → Databases → PostgreSQL Databases.**

1. Create a database, e.g. name it `erp`. cPanel will prefix it with your account username —
   note the full name it shows you, e.g. `youruser_erp`.
2. Create a database user with a strong password, same prefixing applies: `youruser_dbadmin`.
3. Add that user to the database with **ALL PRIVILEGES**.

Your connection string will be:

```
postgresql://seaukeny_erp_admin:HamzaMizou42@localhost:5432/seaukeny_erp
```

(`localhost` because the Node app and the database live on the same server — this is not reachable
from outside, which is fine, the app connects to it locally.)

## 2. Verify the Postgres version supports `gen_random_uuid()`

Every table's primary key is generated with `gen_random_uuid()`. That function has been **built into
PostgreSQL core since version 13** — no extension needed. Shared-hosting Postgres is sometimes an
older version, and extensions (`CREATE EXTENSION pgcrypto`) usually can't be installed by a non-superuser
account on shared hosting, so this check matters _before_ you run migrations, not after.

Open **phpPgAdmin** (usually linked from the PostgreSQL Databases page) or connect via `psql` in
Terminal, and run:

```sql
SELECT version();
SELECT gen_random_uuid();
```

- If both work: you're good, skip to step 3.
- If `gen_random_uuid()` errors with "function does not exist": your Postgres is older than 13.
  Try `CREATE EXTENSION IF NOT EXISTS pgcrypto;` — if that fails with a permissions error (likely on
  shared hosting), contact your host's support and ask them to enable `pgcrypto` for your database.
  This is a one-line request hosts can usually do quickly. Don't proceed with migrations until this
  works — every single table creation will fail otherwise.

## 3. Get the code onto the server

**cPanel → Git Version Control → Create.**

- Clone URL: your GitHub repo URL (use HTTPS; if the repo is private, generate a fine-grained GitHub
  Personal Access Token and use it as the password when cPanel prompts, or add the deploy key cPanel
  shows you to your GitHub repo's Deploy Keys).
- Repository Path: pick a directory **outside** `public_html`, e.g. `/home/youruser/agency-erp`.
  It does not need to be web-accessible — Passenger (see step 4) proxies requests into it regardless
  of where it lives.
- Branch: `main`.

Once created, click **Manage** → **Pull or Deploy** whenever you push new commits later.

## 4. Create the Node.js App

**cPanel → Setup Node.js App → Create Application.**

- **Node.js version**: the highest available, must be ≥ 20.9 (22 recommended — matches what this app
  is built and tested against).
- **Application mode**: Production.
- **Application root**: the same path you cloned into, e.g. `agency-erp`.
- **Application URL**: the domain or subdomain you want the app served on (e.g. `erp.yourdomain.com`
  or your main domain).
- **Application startup file**: `.next/standalone/server.js` — this only exists after your first
  build (step 6), so it's fine if cPanel doesn't validate it yet.

Click **Create**. cPanel will show you the exact `source /home/youruser/nodevenv/agency-erp/22/bin/activate`
command — copy it, you need it in the next steps.

## 5. Set environment variables

Still on the Node.js App page, scroll to **Environment Variables** and add these. This app's
`validateEnv()` **refuses to start** in production if any of the email/storage ones below are
missing — it's a deliberate safety check (a misconfigured production deploy should fail loudly at
boot, not silently log passwords or lose uploaded files), so don't skip them.

| Variable                                                                                         | Value                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                                       | `production`                                                                                                                                                                 |
| `DATABASE_URL`                                                                                   | `postgresql://youruser_dbadmin:PASSWORD@localhost:5432/youruser_erp` (step 1)                                                                                                |
| `BETTER_AUTH_SECRET`                                                                             | A random 32+ character string — generate with `openssl rand -base64 32`                                                                                                      |
| `BETTER_AUTH_URL`                                                                                | `https://erp.yourdomain.com` (your real domain, https, no trailing slash)                                                                                                    |
| `NEXT_PUBLIC_APP_URL`                                                                            | Same value as `BETTER_AUTH_URL`                                                                                                                                              |
| `LOG_LEVEL`                                                                                      | `info`                                                                                                                                                                       |
| `DB_POOL_MAX`                                                                                    | `10` — shared-hosting Postgres plans often cap total connections low; keep this conservative. Raise it only if your host confirms your plan's limit comfortably allows more. |
| `RESEND_API_KEY`                                                                                 | See 5a below                                                                                                                                                                 |
| `EMAIL_FROM`                                                                                     | See 5a below                                                                                                                                                                 |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, (`S3_ENDPOINT` if not AWS) | See 5b below                                                                                                                                                                 |

Your domain needs HTTPS (free via cPanel's AutoSSL, usually automatic) — sessions are set with the
`Secure` cookie flag in production and won't work over plain HTTP.

### 5a. Email (Resend)

The app sends password-reset, invitation, and verification emails through
[Resend](https://resend.com). Free tier covers this easily (3,000 emails/month).

1. Sign up, verify a sending domain (or use their onboarding `resend.dev` sandbox address to start).
2. Create an API key → `RESEND_API_KEY`.
3. `EMAIL_FROM` = `NEODOTT <no-reply@yourdomain.com>` (must be an address on the domain you verified).

### 5b. File storage (S3-compatible)

Documents, receipts, and logos are uploaded here. Shared-hosting local disk isn't used in production
by design (an app restart or migration shouldn't silently lose uploaded files). Two easy options:

- **Cloudflare R2** (recommended — free tier: 10 GB storage, no egress fees, S3-compatible):
  create a bucket, an API token with read/write access, then set:
  - `S3_BUCKET` = your bucket name
  - `S3_REGION` = `auto`
  - `S3_ENDPOINT` = `https://<account-id>.r2.cloudflarestorage.com`
  - `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` = the R2 API token pair
- **AWS S3**: create a bucket, an IAM user scoped to just that bucket, and set `S3_BUCKET`,
  `S3_REGION` (e.g. `eu-west-1`), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Leave `S3_ENDPOINT` unset.

## 6. Build the app

Try building on the server first (6a). If your account's CloudLinux process/thread limit is too
tight even for that (ours was), skip straight to 6b — build on your own machine instead and upload
the result. Either way ends with the same `.next/standalone/` output; **6c (migrations) is required
regardless of which build path you used.**

### 6a. Try: build on the server, via Terminal

**cPanel → Terminal** (or SSH).

```bash
# Activate the Node version cPanel provisioned for this app (path from step 4)
source /home/youruser/nodevenv/agency-erp/22/bin/activate
cd /home/youruser/agency-erp

# --include=dev is required even though this is a production deploy: the
# build needs devDependencies (typescript, tailwindcss) and migrations need
# drizzle-kit — cPanel's Node.js Selector environment often causes a plain
# `npm ci` to silently skip devDependencies, which shows up as "command not
# found" errors for tools you know are in package.json.
npm ci --include=dev
SKIP_ENV_VALIDATION=1 npm run build:webpack
```

If `npm ci` fails on `sh: line 1: husky: command not found` even with `--include=dev`, it's
harmless — `package.json`'s `prepare` script is `husky || true` specifically so a missing husky
binary (git hooks are a local-dev-only concern) can never fail the install. Check whether the build
itself succeeds; if it does, the install was fine.

`build:webpack` runs `next build --webpack` (Next 16's documented Turbopack opt-out) with
`RAYON_NUM_THREADS=1` — Next's native (Rust) compiler spawns a multi-threaded pool sized to the CPU
count it sees regardless of bundler, and CloudLinux LVE (what shared cPanel hosting almost always
runs) caps how many processes/threads your account may spawn, often far below what the OS reports.
Hitting that cap panics with:

```
thread '<unnamed>' panicked ... The global thread pool has not been initialized.:
ThreadPoolBuildError { kind: IOError(Os { code: 11, kind: WouldBlock, message: "Resource temporarily unavailable" }) }
```

Capping the pool at 1 thread is usually enough to fit inside the limit. **If it still panics even at
1 thread**, your account's ceiling is tighter than any thread count can satisfy (confirm with
`ulimit -u`) — stop here and go to 6b.

### 6b. Fallback: build on your own machine, upload the result

This is the reliable path if 6a panics no matter what — no LVE limit exists on your own machine.

**On your own machine**, in the project directory:

```bash
npm run build:webpack   # or plain `npm run build`, Turbopack is fine off shared hosting
```

Set `NEXT_PUBLIC_APP_URL` to your **real production domain** before building
(`NEXT_PUBLIC_APP_URL=https://admin.neodott.com npm run build:webpack`) — Next.js inlines
`NEXT_PUBLIC_*` values into the client bundle permanently at build time; they cannot be changed by a
runtime env var afterward. Getting this wrong means rebuilding.

`postbuild` (`scripts/prepare-standalone.mjs`) leaves you a clean `.next/standalone/` containing only
`server.js`, `node_modules/`, `.next/`, and `public/` — nothing else. (Earlier versions of this script
didn't prune it: on this project, `output: 'standalone'` has been observed copying the **entire
project** — `src/`, `test/`, `drizzle/`, docs, even a copy of your local `.env` — into
`.next/standalone` alongside the real output, reproduced on a clean build, root cause unconfirmed.
The script now deletes anything unexpected automatically. If you're on an older checkout, `ls -a
.next/standalone` first and don't upload it if you see more than those four entries.)

Zip just the *contents* of `.next/standalone` (not the folder itself — you want `server.js` at the
zip's root, not `standalone/server.js`):

```powershell
# Windows PowerShell
Compress-Archive -Path .next/standalone/* -DestinationPath standalone-deploy.zip -Force
```

```bash
# macOS/Linux
cd .next/standalone && zip -r ../../standalone-deploy.zip . && cd ../..
```

**Upload via cPanel File Manager**: navigate to your Application Root (e.g.
`/home/youruser/agency-erp`), create a `.next/standalone` folder if it doesn't already exist (delete
it first if a previous on-server build attempt left a partial one), upload `standalone-deploy.zip`
into it, then use File Manager's **Extract** action so `server.js`, `node_modules/`, `.next/`, and
`public/` land directly inside `.next/standalone/`. Delete the zip afterward.

The git-cloned source (step 3) stays in place alongside this — you still need it for migrations
(6c) and for any future redeploys — it just never runs `next build` itself under this path.

### 6c. Run migrations and seed the first admin (required either way)

Back in Terminal, using the git-cloned source's own dependencies (from 6a's `npm ci --include=dev` —
run it now if you skipped straight to 6b):

```bash
source /home/youruser/nodevenv/agency-erp/22/bin/activate
cd /home/youruser/agency-erp
npm ci --include=dev   # if not already done

export DATABASE_URL="postgresql://youruser_dbadmin:PASSWORD@localhost:5432/youruser_erp"
npx drizzle-kit migrate

export SEED_ADMIN_PASSWORD='ChooseAStrongPassword!'
npm run db:bootstrap-admin
```

**Use `db:bootstrap-admin`, not `db:seed`, in production.** `db:seed` deliberately refuses to create
the company/admin when `NODE_ENV=production` — seeding demo data into a real production database is
the wrong default. But that gate doesn't apply here: the seeded company genuinely *is* the one real
company this deployment is built around (see `MEMORY.md`, "Single-tenant lockdown"), and there's no
other way to get a first account in — sign-up is disabled, and invitations require an existing admin.
`db:bootstrap-admin` runs the same idempotent company/role/admin logic without that gate, specifically
for this one-time bootstrap. It's safe to run again later (every step is a no-op if already done).

If some part of your environment forces `NODE_ENV=production` even when you try to override it
(cPanel's `nodevenv` activation sometimes bakes this in for apps set to "Production" mode) —
`db:bootstrap-admin` sidesteps that entirely, since it has no `NODE_ENV` check to fight in the first
place.

This creates company `neodott` (or whatever `APP_NAME`/seed constants say) and an admin user at
`admin@neodott.test` with the password you set above. **Sign in and change both immediately** — that
seeded email/password pair is meant to be temporary.

## 7. Start the app

Back in **cPanel → Setup Node.js App**, open your application and click **Restart**. Visit your
domain — you should land on `/sign-in`.

If it doesn't come up, click **Restart** again after checking the app's log (same page, there's a
log viewer) — the most common first-boot failure is a missing/invalid environment variable, and
`validateEnv()` will name exactly which one in the log.

---

## Deploying updates later

```
cPanel → Git Version Control → Manage → Update from Remote, then Deploy HEAD Commit
```

Then, in Terminal, install/refresh dependencies and migrate (needed regardless of which build path
you're on — this is the git-cloned source's own devDependencies, for `drizzle-kit`):

```bash
source /home/youruser/nodevenv/agency-erp/22/bin/activate
cd /home/youruser/agency-erp
npm ci --include=dev
npx drizzle-kit migrate   # only if this update includes new migrations
```

Then rebuild, using whichever of 6a/6b actually worked for you initially:

- **On 6a (server build):** `SKIP_ENV_VALIDATION=1 npm run build:webpack` in that same Terminal
  session.
- **On 6b (build locally):** rebuild on your own machine and re-upload/re-extract `.next/standalone`
  the same way as before — nothing to run on the server for this part.

Then **Restart** the app in Setup Node.js App.

---

## Troubleshooting

- **`thread '<unnamed>' panicked ... The global thread pool has not been initialized` during build** —
  Next's native compiler hit your account's CloudLinux process/thread limit. `npm run build:webpack`
  (step 6a) caps it at one thread via `RAYON_NUM_THREADS=1`; if it still panics, skip to 6b (build on
  your own machine, upload `.next/standalone`) — no thread-count fix works past that point.
- **`.next/standalone` contains far more than `server.js`/`node_modules`/`.next`/`public`** — this
  project's `output: 'standalone'` has been observed copying the entire project root into it (docs,
  `test/`, `drizzle/`, even a local `.env`), reproduced on a clean build. `prepare-standalone.mjs`
  (the `postbuild` script) now prunes this automatically — if you're uploading from an older checkout
  and see extra entries, don't upload as-is; re-run `npm run build` (or `build:webpack`) to regenerate
  a clean one, or delete everything except those four entries by hand before zipping.
- **"Missing production configuration" in the log at boot** — one of `RESEND_API_KEY`, `EMAIL_FROM`,
  `S3_BUCKET` isn't set in the Node.js App's environment variables (step 5). The error message names
  the missing one directly.
- **App won't start / 503 from Passenger** — check the Node version is really ≥ 20.9 (Setup Node.js
  App → your app → confirm the version shown), and that `.next/standalone/server.js` exists (means
  step 6's build actually completed and `postbuild` ran).
- **Migrations fail on the very first table** — almost always the `gen_random_uuid()` / Postgres
  version issue from step 2. Confirm `SELECT gen_random_uuid();` works before re-running migrations.
- **Signed in, but immediately bounced back to `/sign-in`** — usually `BETTER_AUTH_URL`/
  `NEXT_PUBLIC_APP_URL` not matching the domain you're actually visiting (including `https://`), or
  the domain not actually having a valid SSL certificate yet (cookies are `Secure`-only in
  production, so they're silently dropped over plain HTTP).
- **Uploads/PDF logos not appearing** — double check the S3-compatible credentials (step 5b); a wrong
  `S3_ENDPOINT` region/bucket combo fails at upload time, not at boot.

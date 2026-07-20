// Runs after `next build`. `output: 'standalone'` (next.config.ts) emits a
// pruned server + node_modules at `.next/standalone`, but deliberately omits
// `public/` and `.next/static/` — Next expects the platform to place those
// itself (the Dockerfile does this with explicit COPY steps for the Docker
// image). This script does the same copy for any deployment that runs
// `.next/standalone/server.js` directly, such as cPanel's Node.js App
// (Passenger), where there is no separate image-assembly step.
//
// Safe to run on every build: Docker's own image build also triggers this via
// `npm run build`, then overwrites the same files with identical content via
// its own COPY steps — redundant, not conflicting.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const standalone = join(root, '.next', 'standalone');

if (!existsSync(standalone)) {
  console.warn(
    '[prepare-standalone] .next/standalone not found (output: "standalone" build did not run) — skipping.',
  );
  process.exit(0);
}

function copy(from, to) {
  if (!existsSync(from)) return;
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.warn(`[prepare-standalone] copied ${from} -> ${to}`);
}

copy(join(root, 'public'), join(standalone, 'public'));
copy(join(root, '.next', 'static'), join(standalone, '.next', 'static'));

// Observed on this project (reproduced on a clean `rm -rf .next` build, not a
// stale artifact): Next's output-file-tracing for `output: 'standalone'` has
// copied the ENTIRE project root into `.next/standalone` alongside the real
// pruned output — src/, test/, drizzle/, graphify-out/, docs, configs, even a
// copy of the local .env. node_modules itself IS correctly pruned (~60
// top-level packages vs. 500+ in the real one), so this only affects loose
// top-level files/dirs, not the dependency tree. Root cause not confirmed;
// pruning here is cheap insurance regardless of cause, and critical because an
// uploaded/deployed standalone bundle must never carry a copy of local `.env`.
const KEEP = new Set(['server.js', 'node_modules', '.next', 'public']);
for (const entry of readdirSync(standalone)) {
  if (KEEP.has(entry)) continue;
  rmSync(join(standalone, entry), { recursive: true, force: true });
  console.warn(`[prepare-standalone] removed unexpected entry: ${entry}`);
}

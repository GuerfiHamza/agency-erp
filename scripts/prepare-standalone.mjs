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

import { cpSync, existsSync, mkdirSync } from 'node:fs';
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

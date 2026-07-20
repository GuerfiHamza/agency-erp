# syntax=docker/dockerfile:1

# Production image. Relies on `output: 'standalone'` in next.config.ts, which
# emits a self-contained server bundle with only the modules it actually uses.
# Node 22 satisfies Next 16's Node 20.9+ floor.
ARG NODE_VERSION=22-alpine

# ---- deps: install node_modules once, cached on lockfile changes only --------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder ----------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Real secrets do not exist at image build time, and NEXT_PUBLIC_* values are
# inlined into the client bundle during the build. This placeholder keeps the
# build honest; SKIP_ENV_VALIDATION defers server-env checks to container start,
# where instrumentation.ts validates the real values before serving traffic.
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV SKIP_ENV_VALIDATION=1
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- runner -----------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run unprivileged: a container escape should not land as root.
# --ingroup is required — without it the user lands in `nogroup` and the
# --chown=nextjs:nodejs copies below grant nothing via the group.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder /app/public ./public
# standalone already contains the pruned node_modules and server.js.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Direct exec — no npm wrapper, so signals reach Node and the container stops cleanly.
CMD ["node", "server.js"]

# Build context must be the monorepo root:
#   docker build -f apps/web/Dockerfile .

# ─── Stage 1: deps ───────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

RUN corepack enable

WORKDIR /app

# Copy workspace manifests and lockfile first to leverage layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy only the package manifests so pnpm can resolve the workspace graph.
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile


# ─── Stage 2: builder ────────────────────────────────────────────────────────
FROM deps AS builder

# NEXT_PUBLIC_* vars are inlined at build time by Next.js — accept as build arg.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

COPY tsconfig.base.json ./
COPY apps/web/ apps/web/

WORKDIR /app/apps/web

RUN pnpm run build


# ─── Stage 3: runner ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app

# Next.js standalone output includes a minimal server.js and all required
# node_modules already pruned to production deps.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static      ./apps/web/.next/static

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/web/server.js"]

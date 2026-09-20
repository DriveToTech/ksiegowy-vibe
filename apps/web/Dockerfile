# Build context must be the monorepo root:
#   docker build -f apps/web/Dockerfile .

# ─── Stage 1: deps ───────────────────────────────────────────────────────────
FROM node:24-alpine AS deps

RUN apk upgrade --no-cache

ARG PACKAGE_REGISTRY=https://registry.npmjs.org
ARG NODE_USE_ENV_PROXY
ENV NODE_USE_ENV_PROXY=${NODE_USE_ENV_PROXY}
ENV COREPACK_DEFAULT_TO_LATEST=0
ENV COREPACK_NPM_REGISTRY=${PACKAGE_REGISTRY}
ENV NPM_CONFIG_REGISTRY=${PACKAGE_REGISTRY}
RUN corepack enable

WORKDIR /app

# Copy workspace manifests and lockfile first to leverage layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy only the package manifests so pnpm can resolve the workspace graph.
COPY apps/web/package.json apps/web/package.json

RUN for attempt in 1 2 3 4 5; do \
      pnpm install --frozen-lockfile && exit 0; \
      if [ "$attempt" -eq 5 ]; then exit 1; fi; \
      sleep 5; \
    done


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
FROM node:24-alpine AS runner

RUN apk upgrade --no-cache
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

ENV NODE_ENV=production

WORKDIR /app

# Next.js standalone output includes a minimal server.js and all required
# node_modules already pruned to production deps.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static      ./apps/web/.next/static

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

USER node

CMD ["node", "apps/web/server.js"]

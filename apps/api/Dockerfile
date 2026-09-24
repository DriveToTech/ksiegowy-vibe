# Build context must be the monorepo root:
#   docker build -f apps/api/Dockerfile .

# ─── Stage 1: deps ───────────────────────────────────────────────────────────
FROM node:24-trixie-slim AS deps

# Install system dependencies required at runtime (Poppler for PDF rendering,
# and Tesseract with the Polish language pack for OCR).
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
      poppler-utils \
      tesseract-ocr \
      tesseract-ocr-pol \
      libxml2-utils \
      ca-certificates \
      libasound2t64 \
      libatk-bridge2.0-0t64 \
      libatk1.0-0t64 \
      libcups2t64 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libgtk-3-0t64 \
      libwayland-client0 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

# Enable Corepack so the exact pnpm version declared in package.json is used.
ARG PACKAGE_REGISTRY=https://registry.npmjs.org
ARG NODE_USE_ENV_PROXY
ENV NODE_USE_ENV_PROXY=${NODE_USE_ENV_PROXY}
ENV COREPACK_DEFAULT_TO_LATEST=0
ENV COREPACK_NPM_REGISTRY=${PACKAGE_REGISTRY}
ENV NPM_CONFIG_REGISTRY=${PACKAGE_REGISTRY}
RUN corepack enable

WORKDIR /app

# Copy workspace manifests and lockfile first to leverage layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./

# Copy all package manifests so pnpm can resolve the workspace graph without
# copying full source trees yet.
COPY packages/types/package.json             packages/types/package.json
COPY packages/shared-utils/package.json      packages/shared-utils/package.json
COPY packages/fa3-xml/package.json           packages/fa3-xml/package.json
COPY packages/ksef-client/package.json       packages/ksef-client/package.json
COPY packages/pdf-templates/package.json     packages/pdf-templates/package.json
COPY apps/api/package.json                   apps/api/package.json

RUN for attempt in 1 2 3 4 5; do \
      pnpm install --frozen-lockfile && exit 0; \
      if [ "$attempt" -eq 5 ]; then exit 1; fi; \
      sleep 5; \
    done


# ─── Stage 2: builder ────────────────────────────────────────────────────────
FROM deps AS builder

# Copy full source for all workspace packages the API depends on.
COPY tsconfig.base.json ./
COPY packages/types/         packages/types/
COPY packages/shared-utils/  packages/shared-utils/
COPY packages/fa3-xml/       packages/fa3-xml/
COPY packages/ksef-client/   packages/ksef-client/
COPY packages/pdf-templates/ packages/pdf-templates/
COPY apps/api/               apps/api/

# Build shared packages sequentially before the API so their dist/ and .d.ts
# files exist when the API tsconfig resolves project references.
# Each step is a small isolated compilation — avoids the OOM spike that
# occurs when tsc resolves the entire workspace graph in a single process.
RUN pnpm --filter @ksiegowy/types         run build
RUN pnpm --filter @ksiegowy/shared-utils  run build
RUN pnpm --filter @ksiegowy/fa3-xml       run build
RUN pnpm --filter @ksiegowy/ksef-client   run build
RUN pnpm --filter @ksiegowy/pdf-templates run build

# Compile the API with swc (Rust-based transpiler) instead of tsc.
# swc uses ~10x less memory than tsc because it skips the TypeScript compiler
# infrastructure entirely — no type checking, no language service, just emit.
# Output is CommonJS so Prisma's CJS client and other CJS packages load without
# ESM named-export limitations.
RUN cd apps/api && pnpm exec swc src -d dist --strip-leading-paths


# ─── Stage 3: production dependencies ───────────────────────────────────────
FROM node:24-alpine AS production-deps

RUN apk upgrade --no-cache

ARG PACKAGE_REGISTRY=https://registry.npmjs.org
ARG NODE_USE_ENV_PROXY
ENV NODE_USE_ENV_PROXY=${NODE_USE_ENV_PROXY}
ENV COREPACK_DEFAULT_TO_LATEST=0
ENV COREPACK_NPM_REGISTRY=${PACKAGE_REGISTRY}
ENV NPM_CONFIG_REGISTRY=${PACKAGE_REGISTRY}
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/types/package.json             packages/types/package.json
COPY packages/shared-utils/package.json      packages/shared-utils/package.json
COPY packages/fa3-xml/package.json           packages/fa3-xml/package.json
COPY packages/ksef-client/package.json       packages/ksef-client/package.json
COPY packages/pdf-templates/package.json     packages/pdf-templates/package.json
COPY apps/api/package.json                   apps/api/package.json
COPY apps/api/prisma/schema.prisma           apps/api/prisma/schema.prisma

# Keep compilers, test runners, and other build-only packages out of the image.
RUN for attempt in 1 2 3 4 5; do \
      CI=true pnpm install --prod --frozen-lockfile && exit 0; \
      if [ "$attempt" -eq 5 ]; then exit 1; fi; \
      sleep 5; \
    done

# Generate the client in the Alpine dependency tree that the runner copies.
# This keeps the generated client beside @prisma/client and includes the musl
# query engine required by the runtime image.
RUN cd apps/api && ./node_modules/.bin/prisma generate --schema prisma/schema.prisma


# ─── Stage 4: runner ─────────────────────────────────────────────────────────
FROM node:24-alpine AS runner

# Re-install only the runtime system dependencies (no build tools). Alpine's
# packages provide Chromium, Poppler, Tesseract, and XML validation without
# carrying the Debian runtime package set into the final image.
RUN apk update \
    && apk upgrade \
    && apk add --no-cache \
      chromium \
      poppler-utils \
      tesseract-ocr \
      tesseract-ocr-data-pol \
      libxml2-utils \
      ca-certificates \
    && rm -rf /var/cache/apk/*

ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# The runtime starts Node directly; npm and npx are build-only tools.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# shamefully-hoist=true hoists external packages to node_modules/, but pnpm
# keeps workspace packages as symlinks: node_modules/@ksiegowy/X -> ../../packages/X.
# Docker COPY preserves symlinks without dereferencing, so the symlink targets
# must also exist in the runner. Copy each workspace package (package.json +
# built dist/) so those symlinks resolve at runtime.
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=production-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=production-deps /app/packages/pdf-templates/node_modules ./packages/pdf-templates/node_modules

COPY --from=builder /app/packages/types/package.json          ./packages/types/package.json
COPY --from=builder /app/packages/types/dist                  ./packages/types/dist

COPY --from=builder /app/packages/shared-utils/package.json   ./packages/shared-utils/package.json
COPY --from=builder /app/packages/shared-utils/dist           ./packages/shared-utils/dist

COPY --from=builder /app/packages/fa3-xml/package.json        ./packages/fa3-xml/package.json
COPY --from=builder /app/packages/fa3-xml/dist                ./packages/fa3-xml/dist

COPY --from=builder /app/packages/ksef-client/package.json    ./packages/ksef-client/package.json
COPY --from=builder /app/packages/ksef-client/dist            ./packages/ksef-client/dist

COPY --from=builder /app/packages/pdf-templates/package.json  ./packages/pdf-templates/package.json
COPY --from=builder /app/packages/pdf-templates/dist          ./packages/pdf-templates/dist

# Compiled API output (CJS .js files, no "type":"module" needed).
COPY --from=builder /app/apps/api/dist  ./apps/api/dist

# Prisma schema and migrations for `prisma migrate deploy` at deploy time.
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

EXPOSE 3001

WORKDIR /app/apps/api

USER node

CMD ["node", "dist/main.js"]

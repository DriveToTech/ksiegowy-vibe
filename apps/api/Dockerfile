# Build context must be the monorepo root:
#   docker build -f apps/api/Dockerfile .

# ─── Stage 1: deps ───────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps

# Install system dependencies required at runtime (graphicsmagick for pdf2pic,
# tesseract-ocr + Polish language pack for OCR).
RUN apt-get update && apt-get install -y --no-install-recommends \
      graphicsmagick \
      tesseract-ocr \
      tesseract-ocr-pol \
      libxml2-utils \
    && rm -rf /var/lib/apt/lists/*

# Enable corepack so the exact pnpm version declared in package.json is used.
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
COPY services/household/package.json         services/household/package.json
COPY apps/api/package.json                   apps/api/package.json

# Skip Puppeteer's bundled Chromium download — the system chromium package is
# used instead, which is smaller and already present in the runner image.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN pnpm install --frozen-lockfile


# ─── Stage 2: builder ────────────────────────────────────────────────────────
FROM deps AS builder

# Copy full source for all workspace packages the API depends on.
COPY tsconfig.base.json ./
COPY packages/types/         packages/types/
COPY packages/shared-utils/  packages/shared-utils/
COPY packages/fa3-xml/       packages/fa3-xml/
COPY packages/ksef-client/   packages/ksef-client/
COPY packages/pdf-templates/ packages/pdf-templates/
COPY services/household/     services/household/
COPY apps/api/               apps/api/

# Generate Prisma client (reads schema only, no database required).
RUN pnpm --filter @ksiegowy/api exec prisma generate --schema prisma/schema.prisma

# Build shared packages sequentially before the API so their dist/ and .d.ts
# files exist when the API tsconfig resolves project references.
# Each step is a small isolated compilation — avoids the OOM spike that
# occurs when tsc resolves the entire workspace graph in a single process.
RUN pnpm --filter @ksiegowy/types         run build
RUN pnpm --filter @ksiegowy/shared-utils  run build
RUN pnpm --filter @ksiegowy/fa3-xml       run build
RUN pnpm --filter @ksiegowy/ksef-client   run build
RUN pnpm --filter @ksiegowy/pdf-templates run build
RUN pnpm --filter @ksiegowy/household-service run build

# Compile the API with swc (Rust-based transpiler) instead of tsc.
# swc uses ~10x less memory than tsc because it skips the TypeScript compiler
# infrastructure entirely — no type checking, no language service, just emit.
# Output is CommonJS so Prisma's CJS client and other CJS packages load without
# ESM named-export limitations.
RUN cd apps/api && pnpm exec swc src -d dist --strip-leading-paths


# ─── Stage 3: runner ─────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

# Re-install only the runtime system dependencies (no dev tools).
RUN apt-get update && apt-get install -y --no-install-recommends \
      graphicsmagick \
      tesseract-ocr \
      tesseract-ocr-pol \
      libxml2-utils \
      chromium \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# shamefully-hoist=true hoists external packages to node_modules/, but pnpm
# keeps workspace packages as symlinks: node_modules/@ksiegowy/X -> ../../packages/X.
# Docker COPY preserves symlinks without dereferencing, so the symlink targets
# must also exist in the runner. Copy each workspace package (package.json +
# built dist/) so those symlinks resolve at runtime.
COPY --from=builder /app/node_modules ./node_modules

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

COPY --from=builder /app/services/household/package.json      ./services/household/package.json
COPY --from=builder /app/services/household/dist              ./services/household/dist

# Compiled API output (CJS .js files, no "type":"module" needed).
COPY --from=builder /app/apps/api/dist  ./dist

# Prisma schema and migrations for `prisma migrate deploy` at deploy time.
COPY --from=builder /app/apps/api/prisma ./prisma

EXPOSE 3001

CMD ["node", "dist/main.js"]

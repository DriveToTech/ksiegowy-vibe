# Infrastructure

This document describes the infrastructure setup, containerisation, CI/CD pipelines, and environment configuration.

---

## Overview

`ksiegowy-vibe` is designed for **self-hosted deployment**. The full stack runs in Docker containers orchestrated by Docker Compose. No managed cloud services are required beyond OAuth2 credentials.

For supported development setups outside the full Docker runtime, see [Development Run Modes](./development-run-modes.md).

```
┌─────────────────────────────────────────┐
│  Docker host                            │
│                                         │
│  ┌──────────┐  ┌──────────┐              │
│  │  web     │  │  api     │              │
│  │ :3000    │  │ :3001    │              │
│  └────┬─────┘  └────┬─────┘              │
│       │              │                   │
│  ┌────┴──────────────┴──────┐            │
│  │  postgres :5432           │            │
│  └──────────────┬────────────┘            │
│                 │                         │
│  one-shot backup-postgres                 │
│  one-shot backup-gdrive-scheduled         │
│  (both host cron triggered)               │
│                                         │
│  ./storage and ./backups/postgresql      │
│  ← bind mounts                           │
└─────────────────────────────────────────┘
```

---

## Docker Compose

File: [`docker-compose.yml`](../docker-compose.yml)

### Services

| Service | Image / Build | Port | Purpose |
|---------|--------------|------|---------|
| `postgres` | `postgres:17-alpine` | 5432 | Primary database |
| `api` | `apps/api/Dockerfile` | 3001 | Fastify REST API |
| `web` | `apps/web/Dockerfile` | 3000 | Next.js frontend |
| `adminer` | `adminer` | 8080 | DB GUI *(profile: tools)* |
| `backup-postgres` | `ops/backup/Dockerfile` | — | One-shot PostgreSQL logical backup (local-only by default, optional rclone upload) *(profile: backup)* |
| `backup-gdrive-scheduled` | `apps/api/Dockerfile` | — | One-shot scheduled company Google Drive policy runner *(profile: backup)* |
| `verify-backups` | `ops/backup/Dockerfile` | — | One-shot backup freshness verification *(profile: backup)* |

### Volumes

| Volume / Mount | Purpose |
|----------------|---------|
| `postgres_data` (named volume) | PostgreSQL data persistence |
| `./storage` (bind mount) | File uploads, generated PDFs and XMLs |
| `./backups/postgresql` (bind mount) | Local PostgreSQL backup artifacts (`.sql.gz`, `.sha256`, `.manifest.json`); mounted read-only into `api` for freshness status and read-write into backup profile services |
| `./ops/backup/rclone/rclone.conf` (bind mount fallback) | Placeholder rclone config used in local-only PostgreSQL backup mode |
| `./storage` (read-only bind in `backup-gdrive-scheduled`) | Scheduled company Google Drive backup source files |

The PostgreSQL container always listens on `5432` inside the Compose network.
Set `POSTGRES_HOST_PORT` to change only the host-published port when another
local process or Colima forwarding already uses host port `5432`:

```bash
export POSTGRES_HOST_PORT=55432
docker compose up -d postgres api
```

Containers continue using `postgres:5432`; host tools use
`localhost:55432`.

### Starting the stack

For mixed local/Docker development commands and env values, use [Development Run Modes](./development-run-modes.md). In particular, when the API runs locally, set `POSTGRESQL_BACKUP_ARTIFACTS_PATH` to the correct absolute repo path for `backups/postgresql`; otherwise backup freshness in company settings can show PostgreSQL source as unavailable because a relative fallback resolves from `apps/api`.

```bash
# Full stack (foreground)
docker compose up --build

# Full stack + Adminer DB GUI
docker compose --profile tools up --build

# Background
docker compose up -d --build

# Rebuild a single service
docker compose up --build api

# Run PostgreSQL backup one-shot service
docker compose --profile backup run --rm backup-postgres

# Run scheduled company Google Drive backup one-shot service
docker compose --profile backup run --rm backup-gdrive-scheduled

# Run backup freshness verification one-shot service
docker compose --profile backup run --rm verify-backups
```

### Host cron wiring for PostgreSQL backup

```mermaid
flowchart LR
    cron[Host cron entry] --> compose[docker compose run backup-postgres]
    compose --> artifacts[Timestamped .sql.gz + .sha256 + .manifest.json]
    artifacts --> primaryRemote[Primary rclone remote optional]
    artifacts --> secondaryRemote[Secondary rclone remote optional]
```

Example crontab entry:

```bash
15 3 * * * cd /path/to/ksiegowy-vibe.pl && docker compose --profile backup run --rm backup-postgres >> /var/log/ksiegowy-postgres-backup.log 2>&1
```

The backup container supports two modes:

- local-only mode: runs successfully with no remotes configured
- remote mode: uploads to configured remotes and fails fast on invalid remote configuration (for example remote set but missing `rclone.conf`)

Docker Compose mounts a bundled placeholder `rclone.conf` by default, so local-only mode does not require setting `DB_BACKUP_RCLONE_CONFIG_PATH`.

### Host cron wiring for scheduled company Google Drive backups

```mermaid
flowchart LR
    cron[Host cron entry every minute] --> compose[docker compose run backup-gdrive-scheduled]
    compose --> policy[Evaluate company backup policies DAILY/WEEKLY]
    policy --> gdriveRun[Run due company Google Drive backups]
```

Example crontab entry:

```bash
* * * * * cd /path/to/ksiegowy-vibe.pl && docker compose --profile backup run --rm backup-gdrive-scheduled >> /var/log/ksiegowy-gdrive-scheduled-backup.log 2>&1
```

PostgreSQL backup job behavior:

- waits for PostgreSQL readiness before `pg_dump`
- writes artifacts locally to `./backups/postgresql`
- uses `BACKUP_DESTINATION_ROOT` as the canonical remote backup root for PostgreSQL remote publishing only when explicitly set
- uploads artifacts to remote staging path only when at least one remote is configured
- verifies remote presence of the full artifact set (`.sql.gz`, `.sha256`, `.manifest.json`) in remote mode
- promotes verified set into a timestamped final directory in remote mode
- removes partial remote set on publish failure in remote mode
- prunes old local artifacts from `./backups/postgresql` using `DB_BACKUP_LOCAL_RETENTION_DAYS`
- keeps Option A database topology unchanged: one shared PostgreSQL database, with each logical backup containing the whole shared database

Current verification scope is limited to remote file presence. It does not yet prove remote checksum integrity or restoreability.

Backup freshness verification behavior (`verify-backups`):

- exits non-zero when required backups are stale, missing, or latest provider run failed
- checks PostgreSQL latest local complete artifact set by environment name (`.sql.gz`, `.sha256`, `.manifest.json`)
- validates local checksum for the latest PostgreSQL artifact set
- checks PostgreSQL local artifact age by environment name
- checks `BackupRun` metadata for `gdrive` freshness/status (company-scoped or platform-scoped)
- checks `BackupRun` metadata for `icloud` freshness/status
- designed for host cron/system monitoring integration via exit code

Requirement mode `auto` uses env-level enablement signals only. It does not guarantee end-to-end provider readiness.

### First-run database setup

```bash
pnpm --filter @ksiegowy/api exec prisma migrate deploy
pnpm db:seed
```

---

## Dockerfiles

### API — `apps/api/Dockerfile`

Multi-stage build. Includes system-level OCR and image processing dependencies.

```
Stage 1 — deps
  Base: node:22-bookworm-slim
  Installs: GraphicsMagick, Tesseract OCR (Polish pack), libxml2-utils
  Installs: pnpm, Node.js workspace dependencies

Stage 2 — builder
  Runs: prisma generate
  Runs: pnpm build (tsc + swc transpilation for all packages and API)

Stage 3 — runner
  Base: node:22-bookworm-slim
  Copies: built artefacts, Prisma client, node_modules
  Installs: Chromium (for Puppeteer PDF generation)
  Cmd: node apps/api/dist/main.js
```

Key system dependencies in the final image:

| Dependency | Purpose |
|-----------|---------|
| `graphicsmagick` | Image pre-processing before OCR |
| `tesseract-ocr` + `tesseract-ocr-pol` | Local Polish-language OCR |
| `libxml2-utils` | XSD validation of FA(3) XML |
| `chromium` | Headless browser for Puppeteer PDF generation |

### Web — `apps/web/Dockerfile`

Multi-stage build using Next.js standalone output mode.

```
Stage 1 — deps
  Base: node:22-alpine
  Installs: pnpm, workspace dependencies

Stage 2 — builder
  Build arg: NEXT_PUBLIC_API_URL
  Runs: next build (produces standalone output)

Stage 3 — runner
  Base: node:22-alpine
  Copies: .next/standalone, .next/static, public/
  Cmd: node server.js
```

The standalone output strips unused Node.js modules — the final image is minimal (~150 MB).

---

## Local Private Registry Image Publishing

The app-repo side of production image publishing is intentionally local-first. Build and push container images to any private OCI-compatible registry from a trusted workstation or deployment host with environment variables set at runtime. Do not store registry secrets in git.

Script entrypoint: [`scripts/publish-container-images.sh`](../scripts/publish-container-images.sh)

Optional `pnpm` wrapper: `pnpm publish:container:images`

### Published images

- `apps/api/Dockerfile` → `${REGISTRY_HOST}/${IMAGE_NAMESPACE}/${API_IMAGE_NAME}:${IMAGE_TAG}`
- `apps/web/Dockerfile` → `${REGISTRY_HOST}/${IMAGE_NAMESPACE}/${WEB_IMAGE_NAME}:${IMAGE_TAG}`

If `SECONDARY_IMAGE_TAG` is set, the script also tags and pushes both images with that second tag.

### Registry publishing environment variables

#### Required

| Variable | Description |
|----------|-------------|
| `REGISTRY_HOST` | Private registry host, for example `registry.example.internal` |
| `IMAGE_NAMESPACE` | Registry namespace or project |
| `REGISTRY_USERNAME` | Registry username or robot-account name |
| `REGISTRY_PASSWORD` | Registry password or robot-account secret |
| `IMAGE_TAG` | Primary tag applied to both images |

#### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `CONTAINER_ENGINE` | `docker` | Container engine command (`docker`, `podman`, or an absolute path) |
| `BUILD_CONTEXT_DIRECTORY` | repo root | Build context used for both image builds |
| `API_DOCKERFILE_PATH` | `apps/api/Dockerfile` | API Dockerfile path |
| `WEB_DOCKERFILE_PATH` | `apps/web/Dockerfile` | Web Dockerfile path |
| `API_IMAGE_NAME` | `api` | API image name inside the registry namespace |
| `WEB_IMAGE_NAME` | `web` | Web image name inside the registry namespace |
| `SECONDARY_IMAGE_TAG` | unset | Optional second tag for both images |
| `WEB_NEXT_PUBLIC_API_URL` | unset | Specific override for the required browser API URL build arg |
| `NEXT_PUBLIC_API_URL` | unset | Standard browser API URL build arg. The publish script uses this when `WEB_NEXT_PUBLIC_API_URL` is not set |

### Example usage

```bash
export REGISTRY_HOST="registry.example.internal"
export IMAGE_NAMESPACE="accounting-apps"
export REGISTRY_USERNAME="publisher"
export REGISTRY_PASSWORD="<registry-secret>"
export IMAGE_TAG="2026-06-13"
export SECONDARY_IMAGE_TAG="latest"
export API_IMAGE_NAME="api"
export WEB_IMAGE_NAME="web"
export NEXT_PUBLIC_API_URL="https://app.example.com/backend"

pnpm publish:container:images
```

### Behavior and safety guarantees

- fails fast on missing required environment variables, missing Dockerfiles, missing build context, or missing container engine command
- requires a non-local browser API URL for the web image through `WEB_NEXT_PUBLIC_API_URL` or `NEXT_PUBLIC_API_URL`
- logs into the target registry with `--password-stdin`
- builds and pushes both images sequentially so failures stop the release early
- prints all published image references at the end for copy/paste into runtime deployment manifests
- keeps the public repository safe because credentials live only in environment variables at execution time

Repository-specific promotion and deployment should stay in your private operations repository, not in this public codebase.

---

## CI/CD — GitHub Actions

Files: [`.github/workflows/`](../.github/workflows/)

### `ci.yml` — Continuous Integration

Triggered on every push and pull request to any branch.

```mermaid
flowchart LR
    push([Push / PR]) --> typecheck[typecheck\ntsc + prisma generate]
    push --> lint[lint\nESLint all packages]
    typecheck --> test_unit[test:unit\nVitest — API + packages]
    lint --> test_unit
    test_unit --> build[build\npnpm build all]
    build --> test_integration[test:integration\nvs PostgreSQL 17 service]
    test_integration --> test_e2e[test:e2e\nPlaywright chromium]
```

| Job | Description |
|-----|-------------|
| `typecheck` | TypeScript type checking + Prisma client generation |
| `lint` | ESLint across all apps and packages |
| `test-unit` | Vitest unit tests for API and shared packages |
| `build` | Full monorepo build (tsc + swc + Next.js) |
| `test-integration` | API integration tests against a live PostgreSQL 17 service container |
| `test-e2e` | Playwright end-to-end tests (chromium) |

### `deploy.yml` — Deployment

Triggered automatically after a successful CI run on `main`.

> **Non-authoritative status:** `deploy.yml` is not the production release path. Keep GitHub deployment disabled/non-authoritative for real releases. The supported public-repo release boundary is local image publication only, documented in [Local Private Registry Image Publishing](#local-private-registry-image-publishing).

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values before starting.

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/ksiegowy` |
| `GOOGLE_CLIENT_ID` | Google OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 client secret |
| `GOOGLE_REDIRECT_URI` | OAuth2 redirect URI, e.g. `http://localhost:3001/auth/google/callback` |
| `JWT_SECRET` | Access token signing secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | Refresh token signing secret (min 32 chars) |
| `ENCRYPTION_KEY` | AES-256-GCM key for encrypting KSeF tokens and backup credentials |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | — | Vision LLM OCR fallback. Required to process incoming invoices when Tesseract fails. |
| `GDRIVE_CLIENT_ID` | — | Google Drive backup OAuth2 client |
| `GDRIVE_CLIENT_SECRET` | — | Google Drive backup OAuth2 client secret |
| `GDRIVE_REDIRECT_URI` | — | Google Drive backup OAuth2 redirect/callback URL |
| `RESEND_API_KEY` | — | Email delivery (invoice PDFs) |
| `GUS_API_KEY` | — | GUS API key for NIP/company lookup |
| `STORAGE_BASE_PATH` | `./storage` | Absolute path to the file storage directory |
| `ICLOUD_BACKUP_PATH` | — | iCloud backup directory path (macOS only) |
| `ICLOUD_RCLONE_REMOTE` | — | rclone remote name used for iCloud backup on Linux/VPS |
| `ICLOUD_RCLONE_DEST` | — | destination path on `ICLOUD_RCLONE_REMOTE` for iCloud backups |
| `DB_BACKUP_ENABLED` | `false` | Enables one-shot PostgreSQL backup service |
| `DB_BACKUP_ENVIRONMENT_NAME` | `local` | Environment label included in artifact names |
| `DB_BACKUP_RETENTION_DAYS` | `14` | Remote retention period for PostgreSQL backup artifacts |
| `DB_BACKUP_LOCAL_RETENTION_DAYS` | `14` | Local retention period for artifacts in `./backups/postgresql` |
| `DB_BACKUP_POSTGRES_READY_TIMEOUT_SECONDS` | `120` | Max wait for PostgreSQL readiness before backup fails |
| `BACKUP_DESTINATION_ROOT` | unset | Optional canonical remote backup root shared by company Google Drive file backups and PostgreSQL remote publishing. Set it to opt in PostgreSQL remote publishing to the unified `<root>/postgresql/<environment>/...` layout. |
| `DB_BACKUP_REMOTE_BASE_PATH` | — | Legacy PostgreSQL remote base path used only when `BACKUP_DESTINATION_ROOT` is unset. |
| `DB_BACKUP_REMOTE_PRIMARY_NAME` | — | Primary rclone remote name |
| `DB_BACKUP_REMOTE_SECONDARY_NAME` | — | Secondary rclone remote name (optional) |
| `DB_BACKUP_RCLONE_CONFIG_PATH` | — | Absolute host path to `rclone.conf` in remote mode. Leave empty in local-only mode to use bundled placeholder config. |
| `POSTGRESQL_BACKUP_ARTIFACTS_PATH` | `./backups/postgresql` | Path used by API freshness checks to read local PostgreSQL backup artifacts (`docker-compose.yml` overrides to `/app/backups/postgresql`) |
| `BACKUP_FRESHNESS_ENABLED` | `true` | Enables one-shot backup freshness verification service |
| `BACKUP_FRESHNESS_REQUIRE_POSTGRESQL_BACKUP` | `auto` | Requirement mode (`true`/`false`/`auto`) for PostgreSQL backup freshness (`auto` = env-level signal) |
| `BACKUP_FRESHNESS_REQUIRE_GDRIVE_BACKUP` | `auto` | Requirement mode (`true`/`false`/`auto`) for Google Drive file backup freshness (`auto` = env-level signal) |
| `BACKUP_FRESHNESS_REQUIRE_ICLOUD_BACKUP` | `auto` | Requirement mode (`true`/`false`/`auto`) for iCloud file backup freshness (`auto` = env-level signal) |
| `BACKUP_FRESHNESS_POSTGRESQL_MAX_AGE_HOURS` | `30` | Max age for latest PostgreSQL local backup artifact |
| `BACKUP_FRESHNESS_GDRIVE_MAX_AGE_HOURS` | `30` | Max age for latest successful Google Drive `BackupRun` |
| `BACKUP_FRESHNESS_ICLOUD_MAX_AGE_HOURS` | `30` | Max age for latest successful iCloud `BackupRun` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | API base URL used by the Next.js frontend |
| `PUPPETEER_EXECUTABLE_PATH` | *(bundled Chromium)* | Path to Chrome/Chromium. On macOS, point to system Chrome to avoid a 200 MB download. |
| `CORS_ORIGIN` | — | Allowed CORS origin for the API |

For Google Drive backup OAuth setup, configure the `GDRIVE_*` variables using the dedicated [Google Drive Backup Setup](./google-drive-backup-setup.md) guide.

---

## Data Persistence

### Database

PostgreSQL stores all application state: companies, users, invoices, contractors, KSeF submission audit trails, backup run history, and more.

Migrations are managed by Prisma and live in `apps/api/prisma/migrations/`. Run on deploy:

```bash
pnpm --filter @ksiegowy/api exec prisma migrate deploy
```

### File Storage

Uploaded PDFs/images and generated FA(3) XML and invoice PDF files are stored on the local filesystem at `./storage` (configurable via `STORAGE_BASE_PATH`).

```
./storage/
└── <companyId>/
    ├── invoices/
    │   ├── <invoiceId>.pdf
    │   └── <invoiceId>.xml
    └── incoming/
        └── <incomingInvoiceId>.<ext>
```

In Docker Compose this directory is bind-mounted from the host, ensuring files survive container restarts and rebuilds.

### Backups

The API process now runs only:

- **Platform iCloud backup** — daily at `02:00`, syncing whole storage (`ICLOUD_BACKUP_PATH` or `rclone`)
- **KSeF offline queue retry** — hourly retry of queued KSeF submissions
- **Invoice-issued auto backup** — asynchronous company-scoped Google Drive trigger when a company policy has `automaticOnInvoiceIssued=true`

Scheduled company Google Drive policy execution is handled out-of-process by one-shot `backup-gdrive-scheduled` service triggered by host cron.

Scheduled company Google Drive runs are best-effort per slot and currently have no catch-up semantics for missed slots.

Invoice-issued Google Drive trigger remains best-effort because it depends on async execution in the API process.

Google Drive execution is company-scoped, incremental by `GoogleDriveCredential.lastBackupAt`, and stored under company-specific folders. It is intentionally independent from `FileRecord.backedUpAt` to avoid cross-provider interference with platform iCloud metadata updates.

Canonical remote destination model:

- company Google Drive files: `<BACKUP_DESTINATION_ROOT>/files/<environment>/company-<companyId>/...`
- PostgreSQL remote artifacts: `<BACKUP_DESTINATION_ROOT>/postgresql/<environment>/<timestamp>/...`

`DB_BACKUP_ENVIRONMENT_NAME` is reused as the `<environment>` path segment source for both flows. Default: `local`.

PostgreSQL backward compatibility rule: when `BACKUP_DESTINATION_ROOT` is unset, PostgreSQL remote publishing stays on legacy `DB_BACKUP_REMOTE_BASE_PATH/<environment>/...` instead of silently migrating to the canonical root.

Backup runs are audited in the `BackupRun` table.

Restore procedures are documented in [File Restore Runbook](./restore-files.md), [PostgreSQL Restore Runbook](./restore-postgresql.md), and [Backup Restore Drill](./backup-restore-drill.md). For a failed Prisma migration or migration-history mismatch, use the [Production Migration Recovery](./production-migration-recovery.md) runbook. It requires an isolated clone before any production ledger or schema change.

In Docker Compose runtime, `api` reads PostgreSQL local artifact freshness from `POSTGRESQL_BACKUP_ARTIFACTS_PATH=/app/backups/postgresql` backed by a read-only bind mount from `./backups/postgresql`.

Company settings consume this as a platform-managed, read-only PostgreSQL backup status indicator. The preferred settings read model is `GET /companies/:companyId/backup-status`, while `GET/PATCH /companies/:companyId/backup-policy` remains focused on editable company Google Drive policy. Technical status fields are exposed in the settings advanced details accordion.

PostgreSQL backups are now handled by a separate one-shot Docker Compose service (`backup-postgres`) that uses PostgreSQL 17 client tools (`pg_dump`).

- local-only mode writes artifacts to `./backups/postgresql` and skips remote upload
- remote mode also uploads artifacts through `rclone` to one or two configured remotes
- Option A keeps one shared PostgreSQL database unchanged, so each PostgreSQL backup remains a full logical dump of the shared database

Each canonical-root remote backup set is stored in its own timestamped directory under the configured base path, for example:

```
<remote>:ksiegowy-vibe-backups/postgresql/production/20260415T031500Z/
```

with files:

- `postgresql-production-20260415T031500Z.sql.gz`
- `postgresql-production-20260415T031500Z.sql.gz.sha256`
- `postgresql-production-20260415T031500Z.manifest.json`

> Encryption note: this implementation does not cryptographically enforce remote encryption itself. Operators must use encrypted backup destinations (for example `rclone crypt` or provider/storage encryption with strict IAM and private access).
> Operator note: local-only mode uses a bundled placeholder `rclone.conf` file. Remote mode requires `DB_BACKUP_RCLONE_CONFIG_PATH` to point to a real host `rclone.conf` file.
> Compatibility note: `BACKUP_DESTINATION_ROOT` is an explicit opt-in for the unified PostgreSQL remote path. When it is unset, the PostgreSQL backup script falls back to legacy `DB_BACKUP_REMOTE_BASE_PATH` instead of silently migrating existing remote destinations.

## Alerting integration by exit code

```mermaid
flowchart LR
    hostCron[Host cron / scheduler] --> verify[docker compose run verify-backups]
    verify -->|exit 0| ok[Backups fresh]
    verify -->|exit non-zero| alert[System alert / ticket / page]
```

Example host cron entry:

```bash
*/30 * * * * cd /path/to/ksiegowy-vibe.pl && docker compose --profile backup run --rm verify-backups >> /var/log/ksiegowy-backup-freshness.log 2>&1
```

Use your platform alerting to trigger on non-zero status, cron mail, or error log pattern.

This slice keeps backup scheduling flows separate intentionally:

- platform iCloud backups and KSeF retry: API in-process cron
- scheduled company Google Drive backups: host cron running `docker compose --profile backup run --rm backup-gdrive-scheduled`
- PostgreSQL backups: host cron running `docker compose --profile backup run --rm backup-postgres`

---

## Security

| Concern | Approach |
|---------|---------|
| Authentication | Google OAuth2, short-lived JWTs in httpOnly cookies |
| Token refresh | Separate refresh token rotation endpoint (`/api/session/refresh`) |
| KSeF tokens at rest | AES-256-GCM encryption via `@ksiegowy/shared-utils` |
| Backup credentials at rest | AES-256-GCM encryption |
| Company data isolation | API enforces `CompanyMembership` check on every company-scoped route |
| Role-based access | `ADMIN` / `ACCOUNTANT` / `VIEWER` checked per route in `AuthPlugin` |
| CORS | Configurable via `CORS_ORIGIN` env variable |

---

## Ports Summary

| Service | Port | Notes |
|---------|------|-------|
| Web (Next.js) | 3000 | Public-facing UI |
| API (Fastify) | 3001 | REST API, internal or reverse-proxied |
| PostgreSQL | 5432 | Internal only, not exposed in production |
| Adminer | 8080 | Dev/ops tool, start with `--profile tools` |
| Mock API (E2E) | 3099 | Test environment only |

---

## Production Deployment Checklist

- [ ] Export Harbor publishing environment variables on the trusted workstation or deployment host only (never commit Harbor credentials)
- [ ] Run `pnpm publish:harbor:images` and record the published API and web image references
- [ ] Set all required environment variables in `.env`
- [ ] Use a strong, randomly generated `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `ENCRYPTION_KEY`
- [ ] Set `CORS_ORIGIN` to your production domain
- [ ] Set `NEXT_PUBLIC_API_URL` to your production browser-facing API URL, for example `https://app.example.com/backend`
- [ ] Run `prisma migrate deploy` after every release
- [ ] Keep the [Production Migration Recovery](./production-migration-recovery.md) procedure available to the release operator; never use `migrate reset` or in-place database cleanup in production
- [ ] Mount `./storage` on durable storage (not ephemeral container filesystem)
- [ ] Confirm backup credentials are configured (Google Drive or iCloud)
- [ ] Configure PostgreSQL backup env vars (`DB_BACKUP_*`) for local-only mode or remote mode
- [ ] If remote mode is enabled, configure at least one rclone remote and set `DB_BACKUP_RCLONE_CONFIG_PATH`
- [ ] Add host cron entry for `docker compose --profile backup run --rm backup-postgres`
- [ ] Add host cron entry for `docker compose --profile backup run --rm backup-gdrive-scheduled`
- [ ] Keep `./backups/postgresql` on durable storage and exclude it from git
- [ ] Ensure backup remote uses encryption-at-rest and private access controls
- [ ] Put a reverse proxy (nginx / Caddy) in front of `:3000` and `:3001` with TLS
- [ ] Do not expose PostgreSQL port `:5432` publicly

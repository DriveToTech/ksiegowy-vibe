# Development Run Modes

This guide covers the three development run modes currently supported in this repository.

- **Mode 1: all in Docker containers** — web, API, and PostgreSQL run in Docker.
- **Mode 2: all local** — web and API run locally with `pnpm`, while PostgreSQL still runs in Docker.
- **Mode 3: web local, API + PostgreSQL in Docker** — useful when you want fast frontend iteration without running the API locally.

> This document describes current repo reality. It does **not** claim support for running PostgreSQL fully locally outside Docker.

## Shared rules

- Copy `.env.example` to `.env` before starting.
- `pnpm dev` loads variables from `.env` and starts **API + web locally**.
- `pnpm dev:web` loads variables from `.env` and starts **only web locally**.
- Container hostnames such as `http://api:3001` and `postgres` work **only inside the Docker network**. Local processes must use `localhost`.
- `POSTGRES_HOST_PORT` changes only the host-published PostgreSQL port. Docker services continue connecting to `postgres:5432` inside the Compose network.
- `BACKUP_DESTINATION_ROOT` is the canonical remote backup root for company Google Drive file backups. For PostgreSQL remote publishing, setting it is an explicit opt-in to the unified `<root>/postgresql/<environment>/...` layout; when it is unset, legacy `DB_BACKUP_REMOTE_BASE_PATH/<environment>/...` destinations remain in use. It does not change the local PostgreSQL artifact directory, which remains repo `backups/postgresql`.
- When the API runs locally, set `POSTGRESQL_BACKUP_ARTIFACTS_PATH` to an **absolute path** pointing at the repo backup artifacts directory, for example:

```bash
POSTGRESQL_BACKUP_ARTIFACTS_PATH=/Users/maciejtrybula/Projects/ksiegowy-vibe.pl/backups/postgresql
```

This avoids the local API resolving `./backups/postgresql` from `apps/api`, which can make company settings show **Platform PostgreSQL backup source is unavailable**.

### Database migration commands

For local development, run the databases explicitly:

```bash
pnpm db:migrate:company
pnpm db:migrate:household
```

Both commands load `.env` and use Prisma `migrate dev`. The existing
`pnpm db:migrate` command remains a shorthand that runs them sequentially. For
production or release deployments, use `prisma migrate deploy` separately:

```bash
pnpm --filter @ksiegowy/api exec prisma migrate deploy --schema prisma/schema.prisma
pnpm --filter @ksiegowy/household-service exec prisma migrate deploy --schema prisma/schema.prisma
```

Prisma Studio is long-running and must be opened for one database at a time:

```bash
pnpm db:studio:company
pnpm db:studio:household
```

`pnpm db:studio` remains a backward-compatible alias for company Studio.

## Mode 1 — all in Docker containers

### What runs where

| Part | Runtime |
|------|---------|
| Web | Docker |
| API | Docker |
| PostgreSQL | Docker |

### Startup commands

```bash
cp .env.example .env
docker compose up --build
```

Run migrations after the stack is up:

```bash
pnpm --filter @ksiegowy/api exec prisma migrate deploy --schema prisma/schema.prisma
pnpm --filter @ksiegowy/household-service exec prisma migrate deploy --schema prisma/schema.prisma
```

Optional seed:

```bash
pnpm db:seed
```

### Environment expectations

| Variable | Value / expectation |
|----------|---------------------|
| `API_URL` | `http://api:3001` inside Docker web |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` |
| `DATABASE_URL` | Docker Compose overrides it to `postgresql://<user>:<password>@postgres:5432/<database>` for the API container |
| `HOUSEHOLD_DATABASE_URL` | Docker Compose overrides it to the separate household database on `postgres:5432` for the API container |
| `POSTGRES_HOST_PORT` | Host port published for PostgreSQL; set it to another free port such as `55432` when host port `5432` is occupied |
| `POSTGRESQL_BACKUP_ARTIFACTS_PATH` | Docker API uses `/app/backups/postgresql` |

### Access URLs

- Web: `http://localhost:3000`
- API: `http://localhost:3001`

## Mode 2 — all local (PostgreSQL in Docker)

### What runs where

| Part | Runtime |
|------|---------|
| Web | Local `pnpm` |
| API | Local `pnpm` |
| PostgreSQL | Docker |

### Startup commands

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate:company
pnpm db:migrate:household
pnpm db:seed
pnpm dev
```

Optional Adminer:

```bash
docker compose --profile tools up -d
```

### Environment expectations

| Variable | Value / expectation |
|----------|---------------------|
| `API_URL` | `http://localhost:3001` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` |
| `DATABASE_URL` | `postgresql://<user>:<password>@localhost:5432/<database>` |
| `HOUSEHOLD_DATABASE_URL` | `postgresql://<user>:<password>@localhost:5432/<household-database>?connection_limit=5` |
| `POSTGRESQL_BACKUP_ARTIFACTS_PATH` | Use an absolute path to repo `backups/postgresql` |

Recommended local API setting:

```bash
POSTGRESQL_BACKUP_ARTIFACTS_PATH=/Users/maciejtrybula/Projects/ksiegowy-vibe.pl/backups/postgresql
```

Why this matters:

- the backup job writes artifacts to repo `backups/postgresql`
- Docker API reads them from `/app/backups/postgresql`
- local API can fall back to `./backups/postgresql` relative to `apps/api`
- that fallback points at the wrong place for normal local development

## Mode 3 — web local, API + PostgreSQL in Docker

### What runs where

| Part | Runtime |
|------|---------|
| Web | Local `pnpm` |
| API | Docker |
| PostgreSQL | Docker |

### Startup commands

```bash
pnpm install
cp .env.example .env
docker compose up --build -d postgres api
pnpm dev:web
```

If migrations are needed:

```bash
pnpm --filter @ksiegowy/api exec prisma migrate deploy --schema prisma/schema.prisma
pnpm --filter @ksiegowy/household-service exec prisma migrate deploy --schema prisma/schema.prisma
```

When host port `5432` is occupied by Colima or another local service, use a
different host port without changing the container connection:

```bash
export POSTGRES_HOST_PORT=55432
docker compose up -d postgres api
pnpm --filter @ksiegowy/api exec prisma migrate deploy --schema prisma/schema.prisma
pnpm --filter @ksiegowy/household-service exec prisma migrate deploy --schema prisma/schema.prisma
```

The API container still connects to `postgres:5432`; only host tools connect to
`localhost:55432`.

Optional seed:

```bash
pnpm db:seed
```

### Environment expectations

| Variable | Value / expectation |
|----------|---------------------|
| `API_URL` | `http://localhost:3001` in local web `.env` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` |
| `DATABASE_URL` | Local web does not use it; Docker API gets Docker Compose database URL pointing at `postgres` |
| `HOUSEHOLD_DATABASE_URL` | Local web does not use it; Docker API gets the separate Docker Compose household database URL |
| `POSTGRESQL_BACKUP_ARTIFACTS_PATH` | Docker API uses `/app/backups/postgresql` |

This mode works because:

- local web calls the API through published host port `localhost:3001`
- Docker web-only hostname `http://api:3001` is **not** valid from the local browser or local Next.js process

## Troubleshooting

### `Platform PostgreSQL backup source is unavailable`

Most often this means the API is looking in the wrong artifacts directory.

Check:

1. Are backup artifacts actually present in repo `backups/postgresql`?
2. If the API runs locally, is `POSTGRESQL_BACKUP_ARTIFACTS_PATH` set to the correct **absolute** path?
3. If the API runs in Docker, is the service started through `docker compose` so `/app/backups/postgresql` is mounted?

Safe local example:

```bash
POSTGRESQL_BACKUP_ARTIFACTS_PATH=/Users/maciejtrybula/Projects/ksiegowy-vibe.pl/backups/postgresql
```

If this variable is missing in local API runtime, freshness checks can resolve `./backups/postgresql` under `apps/api` instead of the repo root backup directory.

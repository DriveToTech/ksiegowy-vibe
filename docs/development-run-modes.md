# Development Run Modes

This guide covers the four development run modes currently supported in this repository.

- **Mode 1: all in Docker containers** — web, API, and PostgreSQL run in Docker.
- **Mode 2: all local** — web and API run locally with `pnpm`, while PostgreSQL still runs in Docker.
- **Mode 3: web local, API + PostgreSQL in Docker** — useful when you want fast frontend iteration without running the API locally.
- **Mode 4: desktop gateway with local web and API** — useful when you want to validate the Electron shell against the local desktop gateway contract.

> This document describes current repo reality. It does **not** claim support for running PostgreSQL fully locally outside Docker.

## Shared rules

- Copy `.env.example` to `.env` before starting.
- Root `pnpm` scripts load variables from `.env` via `dotenv-cli`, not by shell-sourcing the file.
- `pnpm dev` loads variables from `.env` and starts **API + web locally**.
- `pnpm dev:web` loads variables from `.env` and starts **only web locally**.
- If an `.env` value contains spaces or special characters such as `|`, wrap it in quotes, for example `EXAMPLE_VALUE="text with spaces | pipe"`.
- Use absolute paths in `.env`. `~` is not expanded automatically by dotenv loaders.
- Container hostnames such as `http://api:3001` and `postgres` work **only inside the Docker network**. Local processes must use `localhost`.
- When the API runs locally, set `POSTGRESQL_BACKUP_ARTIFACTS_PATH` to an **absolute path** pointing at the repo backup artifacts directory, for example:

```bash
POSTGRESQL_BACKUP_ARTIFACTS_PATH=/Users/maciejtrybula/Projects/ksiegowy-vibe.pl/backups/postgresql
```

This avoids the local API resolving `./backups/postgresql` from `apps/api`, which can make company settings show **Platform PostgreSQL backup source is unavailable**.

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
docker compose exec api node node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
```

Optional seed:

```bash
docker compose exec api node node_modules/.bin/tsx scripts/seed.ts
```

### Environment expectations

| Variable | Value / expectation |
|----------|---------------------|
| `API_URL` | `http://api:3001` inside Docker web |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` |
| `DATABASE_URL` | Docker Compose overrides it to `postgresql://<user>:<password>@postgres:5432/<database>` for the API container |
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
pnpm db:migrate
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
docker compose exec api node node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
```

Optional seed:

```bash
docker compose exec api node node_modules/.bin/tsx scripts/seed.ts
```

### Environment expectations

| Variable | Value / expectation |
|----------|---------------------|
| `API_URL` | `http://localhost:3001` in local web `.env` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` |
| `DATABASE_URL` | Local web does not use it; Docker API gets Docker Compose database URL pointing at `postgres` |
| `POSTGRESQL_BACKUP_ARTIFACTS_PATH` | Docker API uses `/app/backups/postgresql` |

This mode works because:

- local web calls the API through published host port `localhost:3001`
- Docker web-only hostname `http://api:3001` is **not** valid from the local browser or local Next.js process

## Mode 4 — desktop gateway with local web and API

### What runs where

| Part | Runtime |
|------|---------|
| Web | Local `pnpm` with desktop browser API/auth prefixes |
| API | Local `pnpm` |
| Desktop | Local Electron + Fastify gateway |
| PostgreSQL | Docker |

### Quick Start (Recommended for Desktop Development)

```bash
# 1. Install and configure
pnpm install
cp .env.example .env

# 2. Start PostgreSQL
docker compose up -d postgres

# 3. Run migrations and seed
pnpm db:migrate
pnpm db:seed

# 4. Start API (Terminal 1)
pnpm --filter @ksiegowy/api dev

# 5. Start Web with desktop prefixes (Terminal 2)
pnpm dev:web:desktop

# 6. Start Desktop (Terminal 3)
pnpm dev:desktop
```

### Individual Commands Reference

| Command | Purpose |
|---------|---------|
| `pnpm --filter @ksiegowy/api dev` | Start Fastify API on port 3001 |
| `pnpm dev:web:desktop` | Start Next.js web with desktop browser prefixes |
| `pnpm dev:desktop` | Start Electron with the default desktop gateway port (`3001`) |
| `pnpm --filter @ksiegowy/desktop build` | Compile TypeScript to dist/ |
| `pnpm --filter @ksiegowy/desktop pack` | Create unpackaged app for testing |

### Environment expectations

| Variable | Value / expectation |
|----------|---------------------|
| `API_URL` | `http://localhost:3001` for server-side Next requests and desktop API upstream fallback |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` fallback only |
| `NEXT_PUBLIC_BROWSER_API_URL` | `/_desktop/api` |
| `NEXT_PUBLIC_BROWSER_AUTH_URL` | `/auth` |
| `DESKTOP_WEB_RUNTIME_URL` | `http://127.0.0.1:3000` |
| `DESKTOP_API_URL` | Usually `http://localhost:3001` |
| `DESKTOP_AUTH_CALLBACK_URL` | `ksiegowy-vibe://auth/desktop/callback` or localhost-only `http/https` callback on `/auth/desktop/callback`; remote origins, credentials, query strings, and fragments are rejected |
| `DESKTOP_GATEWAY_PORT` | Optional localhost port override; keep `GOOGLE_REDIRECT_URI` and Google OAuth config aligned if you change it |

This mode works because:

- browser-originated business API requests stay on the desktop gateway origin via `/_desktop/api`
- browser auth entrypoints stay on the desktop gateway origin via `/auth`
- server-side Next requests coming through the desktop gateway are routed back through the gateway so auth and business API calls keep using the sidecar-backed localhost origin
- Electron loads the local gateway origin instead of the web runtime origin directly

Useful smoke check:

```bash
curl http://127.0.0.1:3001/_desktop/health
```

## Desktop-Specific Troubleshooting

### Desktop app won't start

1. **Check prerequisites are running:**
   ```bash
   # Verify API is accessible
   curl http://localhost:3001/health

   # Verify web is accessible
   curl http://localhost:3000

   # Verify desktop gateway health (if running)
    curl http://127.0.0.1:3001/_desktop/health
   ```

2. **Check environment variables:**
   - `DESKTOP_WEB_RUNTIME_URL` must point to running web dev server (default: `http://127.0.0.1:3000`)
   - `DESKTOP_API_URL` must point to running API (default: `http://localhost:3001`)

3. **Common errors:**

   | Error | Solution |
   |-------|----------|
   | `DESKTOP_WEB_RUNTIME_URL must point to a localhost origin` | Ensure web dev server is running on localhost |
   | `API_URL must point to an origin without path, query, hash, or credentials` | Check API_URL has no path suffix like `/api` |
    | Port already in use | Change `DESKTOP_GATEWAY_PORT`, then update `GOOGLE_REDIRECT_URI` and the Google OAuth app redirect URI to the same port |

### Desktop OAuth sign-in not working

1. **Verify Google OAuth configuration:**
   - `GOOGLE_REDIRECT_URI` must point at the desktop gateway callback, for example `http://localhost:3001/auth/google/callback`
   - `DESKTOP_AUTH_CALLBACK_URL` must be `ksiegowy-vibe://auth/desktop/callback` or localhost callback
   - Google OAuth app must have this exact redirect URI configured

2. **Check protocol registration:**
   - First run may prompt to allow the app to handle `ksiegowy-vibe://` URLs
   - On macOS: System Preferences → Security → Allow

3. **Desktop-specific OAuth flow:**
   - Click "Sign in with Google" in desktop app
   - Browser opens with Google OAuth
   - After authentication, redirect opens desktop app via protocol
   - Desktop completes `/auth/client/exchange` automatically

### Desktop build/packaging issues

1. **Clean and rebuild:**
   ```bash
   pnpm --filter @ksiegowy/desktop clean
   pnpm --filter @ksiegowy/desktop build
   ```

2. **Install native dependencies:**
   ```bash
   pnpm --filter @ksiegowy/desktop install-app-deps
   ```

3. **Check TypeScript errors:**
   ```bash
   pnpm --filter @ksiegowy/desktop typecheck
   ```

## General Troubleshooting

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

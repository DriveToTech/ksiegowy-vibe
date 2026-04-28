# Desktop Implementation Plan

## Status

- Overall: `partially implemented`
- Scope:
  - add Electron desktop support in a dedicated `apps/desktop` workspace
  - keep the existing web and API product architecture intact
  - ship signed staged desktop releases for supported operating systems

## Objective

Deliver a cross-platform desktop application that:

- runs through Electron with a hardened renderer boundary
- loads a single localhost origin in `BrowserWindow`
- serves the packaged Next.js standalone UI behind a local Fastify desktop gateway
- proxies business API traffic to the existing self-hosted Fastify API in the initial delivery
- uses OS-backed secret storage and encrypted local desktop state
- supports signed staged updates via `electron-builder` and `electron-updater`

## Confirmed Findings

1. The repository is a `pnpm` workspace monorepo with `apps/web` and `apps/api`.
2. `apps/web` uses Next.js 15 App Router and is already built for standalone runtime in Docker.
3. `apps/api` uses Fastify 5 + TypeScript and depends on PostgreSQL 17 + Prisma.
4. Current product capabilities rely on server-side infrastructure that is not desktop-ready as a fully local bundle:
   - PostgreSQL 17 + Prisma
   - local filesystem storage on the deployed host
   - Google OAuth2 callback handling
   - Puppeteer PDF generation
   - Tesseract OCR
5. Current deployment and operational docs are Docker-first and self-hosted, not desktop-first.
6. Desktop security and release constraints are already clear:
   - `sandbox: true`
   - `contextIsolation: true`
   - `nodeIntegration: false`
   - narrow typed preload contract
   - OS secret store for secrets
   - encrypted local sensitive data
   - signed staged desktop releases
7. Initial desktop workspace scaffolding now exists.
   - `apps/desktop` is present as a dedicated Electron workspace.
   - minimal Electron main and preload entrypoints are defined.
   - the initial workspace enforces localhost-only renderer loading and a typed preload API.

## Scope

In scope:

- create `apps/desktop` with Electron main, preload, packaging, and update flow
- create a local Fastify desktop gateway for the localhost app origin
- package `apps/web` standalone output for desktop use
- proxy `/api` and auth traffic from the desktop gateway to the configured self-hosted API
- introduce desktop-safe auth flow using the system browser
- define minimal typed preload APIs for approved desktop capabilities
- store secrets in OS-backed secret storage
- encrypt sensitive local desktop cache and temporary persisted state
- add desktop packaging, signing, update, and release documentation

## Non-Goals

- packaging PostgreSQL in the initial desktop application
- moving all business logic into Electron main or preload
- replacing the existing deployed Fastify API in the first release
- delivering full offline accounting workflows in the first increment
- creating a separate native UI stack outside `apps/web`
- exposing generic file system, shell, or process execution to the renderer

## Architecture Decisions

1. **Electron is shell-only**
   - desktop-specific concerns live in `apps/desktop`
   - business logic stays in the existing server-side system

2. **One localhost origin**
   - the renderer loads one local origin only
   - the local Fastify desktop gateway becomes the renderer entrypoint

3. **Next.js stays the only UI runtime**
   - desktop uses packaged standalone output from `apps/web`
   - no second renderer framework is introduced

4. **Desktop starts online-first**
   - the self-hosted API remains the source of truth in the initial delivery
   - later local-first capabilities must be approved feature by feature

5. **Preload stays narrow and typed**
   - only approved capabilities such as file dialogs, update status, and explicit desktop actions cross the boundary

6. **Desktop secrets use OS storage**
   - refresh tokens, key material, and other secrets do not live in plain files or renderer storage

7. **Desktop delivery uses signed staged updates**
   - `electron-builder` packages the application
   - `electron-updater` delivers staged signed releases

## Proposed Architecture

```mermaid
flowchart TD
    User["User"] --> Main["Electron main process"]
    Main --> Preload["Typed preload bridge"]
    Preload --> Window["BrowserWindow"]
    Window -->|loads localhost origin| Gateway["Local Fastify desktop gateway"]
    Gateway -->|serves or proxies UI routes| Web["Packaged Next.js standalone UI"]
    Gateway -->|proxies /api and auth| RemoteApi["Configured self-hosted Fastify API"]
    Main --> Secrets["OS secret store"]
    Gateway --> Cache["Encrypted local desktop cache"]
    Main --> Updater["electron-updater"]
    RemoteApi --> Database[("PostgreSQL 17 + Prisma")]
```

## Phased Implementation Plan

### Now

Goal: establish the minimum secure desktop shell around the existing product.

1. Create `apps/desktop`
   - Electron main process
   - preload entrypoint
   - desktop-specific TypeScript config
   - root `pnpm` scripts for desktop development and build
   - **Status in this slice:** implemented as initial workspace scaffold with local build and typecheck support

2. Add the local desktop gateway
   - Fastify-based localhost entrypoint
   - health and readiness endpoints
   - reverse proxy to packaged Next.js standalone output
   - proxy `/api` and auth traffic to the configured self-hosted API
   - **Status in this slice:** implemented as a localhost-only Fastify gateway with `/_desktop/health`, API-backed auth proxying plus a web-served `/auth/desktop/callback` page, `/_desktop/api/*` business API proxying, UI reverse proxying to `DESKTOP_WEB_RUNTIME_URL`, and desktop-safe OAuth callback handoff using a short-lived one-time exchange

3. Harden the renderer boundary
   - `sandbox: true`
   - `contextIsolation: true`
   - `nodeIntegration: false`
   - typed preload contract only
   - strict navigation and external-open allowlists

4. Define desktop authentication flow
   - system browser for Google sign-in
   - callback handoff into desktop session flow
   - cookie and session behavior validated against the localhost desktop origin

5. Add desktop storage foundations
   - OS app-data path layout
   - OS secret store integration
   - encrypted local cache for sensitive desktop data

### Next

Goal: make the desktop app releasable and operationally safe.

1. Add packaging and signing
   - `electron-builder` configuration
   - macOS notarization flow
   - Windows signing flow
   - artifact outputs and release metadata

2. Add updater flow
   - `electron-updater`
   - staged rollout channels
   - rollback-ready release procedure

3. Add approved desktop capabilities
   - file pick/save dialogs
   - safe external-link handling
   - update status UI
   - bounded local cache or work queue only where explicitly needed

4. Add desktop verification coverage
   - packaged startup smoke tests
   - auth flow checks
   - preload contract tests
   - navigation and security regression checks

### Later

Goal: extend desktop value only where it is justified by product needs.

1. Evaluate bounded local-first features
   - encrypted drafts
   - short-lived upload or OCR queue
   - retryable background actions

2. Reassess local sidecar support only if needed
   - only for clearly bounded workflows
   - not as a full replacement for the deployed system of record

3. Expand release operations
   - richer rollout dashboards
   - crash reporting and support bundles
   - documented rollback drills

## Risks And Mitigations

- **OAuth flow complexity in desktop**  
  Mitigation: use the system browser and prove callback behavior early.

- **Cookie and session drift on localhost**  
  Mitigation: define one canonical desktop origin and validate session rules in packaged builds.

- **Desktop packaging drift from the web app**  
  Mitigation: keep `apps/web` as the only UI runtime and package the standalone build directly.

- **Secret leakage on local machines**  
  Mitigation: use OS secret storage and encrypt sensitive local data at rest.

- **Release pipeline complexity**  
  Mitigation: add signing, notarization, and updater flow before broad beta release.

- **Offline scope expansion**  
  Mitigation: treat local-first support as opt-in per workflow, not as a blanket product promise.

## Verification Checklist

### Phase 1: Foundation ✅
- [x] `apps/desktop` builds from the monorepo workspace
- [x] local Fastify gateway serves or proxies the packaged Next.js UI correctly
- [x] `BrowserWindow` loads only the configured localhost origin
- [x] preload API is typed, minimal, and does not expose raw Node.js access
- [x] Google sign-in works through the desktop-safe system-browser flow
- [x] secrets are stored in the OS secret store (encrypted file-based)
- [x] sensitive local desktop state is encrypted at rest
- [x] packaged desktop app builds successfully (DMG, ZIP, etc.)

### Phase 2: API Sidecar
- [ ] `apps/desktop` packages API code as extra resources
- [ ] API sidecar starts as child process from Electron main
- [ ] Desktop gateway proxies to local API instead of external URL
- [ ] API uses user-provided or bundled PostgreSQL
- [ ] Health checks monitor API sidecar status
- [ ] Graceful shutdown of API process on app quit
- [ ] Update documentation for self-contained distribution

### Phase 3: SQLite Support (Future)
- [ ] SQLite-compatible Prisma schema created
- [ ] Database router detects and switches between PostgreSQL/SQLite
- [ ] Desktop uses SQLite by default (file in user data directory)
- [ ] Data migration path from cloud to local
- [ ] Sync mechanism for cloud ↔ local data
- [ ] Full offline capability verified

### Phase 4: Release & Distribution
- [ ] update metadata and signed artifacts are generated in CI
- [ ] staged release and rollback runbooks are documented
- [ ] README and dedicated desktop docs are updated

## Phase 2: API Sidecar Implementation

### Objective
Bundle the Fastify API (`apps/api`) into the desktop distribution and run it as a child process, creating a self-contained desktop application that still uses PostgreSQL.

### Architecture Change

```
Before (External API):
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Desktop   │────▶│   Gateway    │────▶│  External API   │
│   (Electron)│     │  (localhost) │     │  (cloud/server) │
└─────────────┘     └──────────────┘     └─────────────────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │  PostgreSQL  │
                                         │  (external)  │
                                         └──────────────┘

After (Bundled API):
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Desktop   │────▶│   Gateway    │────▶│  API Sidecar    │
│   (Electron)│     │  (localhost) │     │  (Node.js child)│
└─────────────┘     └──────────────┘     └─────────────────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │  PostgreSQL  │
                                         │  (external)  │
                                         └──────────────┘
```

### Implementation Steps

#### 2.1 Create API Sidecar Module

**Files to create:**
- `apps/desktop/src/api-sidecar.ts` - API process management
- `apps/desktop/src/prisma-binary-resolver.ts` - Prisma engine path resolution

**Key features:**
- Spawn API as child process using `node:child_process`
- Auto-detect available port
- Health check monitoring
- Graceful shutdown with SIGTERM → SIGKILL escalation
- Log forwarding to Electron's logging system

**API Configuration:**
```typescript
interface ApiSidecarOptions {
  databaseUrl: string;      // PostgreSQL connection
  port?: number;            // Auto-assigned if not specified
  nodeEnv?: string;       // 'production' for packaged
}
```

#### 2.2 Update Desktop Gateway

**Modify:** `apps/desktop/src/desktop-gateway.ts`

**Changes:**
- Start API sidecar before creating gateway
- Use API's dynamically assigned port for proxying
- Proxy all `/_desktop/api/*` to local API
- Handle API process lifecycle (startup, health checks, shutdown)

#### 2.3 Package API with Desktop

**Update:** `apps/desktop/package.json` build configuration

**Add to `build.extraResources`:**
```json
{
  "extraResources": [
    { "from": "../api/dist", "to": "api/dist" },
    { "from": "../api/prisma", "to": "api/prisma" },
    { "from": "../api/node_modules/.prisma/client", "to": "api/node_modules/.prisma/client" },
    { "from": "../../node_modules/@prisma/engines", "to": "api/node_modules/@prisma/engines" }
  ],
  "asarUnpack": [
    "resources/api/node_modules/.prisma/client/**/*",
    "resources/api/node_modules/@prisma/engines/**/*"
  ]
}
```

#### 2.4 Environment Variable Strategy

**Packaged app:**
- `DATABASE_URL` - Must be provided by user or set during first run
- `API_PORT` - Auto-assigned (0 = random available port)
- `NODE_ENV` - Set to 'production'
- `PRISMA_QUERY_ENGINE_LIBRARY` - Point to bundled engine binary

**First-run experience:**
- Dialog asking for PostgreSQL connection string
- Validation of connection before starting API
- Save config to encrypted local cache

#### 2.5 Prisma Binary Handling

**Challenge:** Prisma requires platform-specific query engine binaries.

**Solution:**
```typescript
// Detect platform and architecture
const platform = process.platform; // darwin, win32, linux
const arch = process.arch;       // x64, arm64

// Construct binary path
const binaryName = platform === 'win32' 
  ? 'query_engine-windows.dll.node'
  : platform === 'darwin'
    ? `query_engine-darwin-${arch}.dylib.node`
    : `query_engine-linux-${arch}.so.node`;

// Set environment variable for Prisma
process.env.PRISMA_QUERY_ENGINE_LIBRARY = join(
  process.resourcesPath,
  'api', 'node_modules', '.prisma', 'client',
  binaryName
);
```

### Files Modified

| File | Change |
|------|--------|
| `apps/desktop/package.json` | Add API to extraResources, update dependencies |
| `apps/desktop/src/main.ts` | Integrate API sidecar startup/shutdown |
| `apps/desktop/src/desktop-gateway.ts` | Proxy to local API instead of external URL |
| `apps/desktop/src/api-sidecar.ts` | New file: API process management |
| `apps/desktop/src/prisma-binary-resolver.ts` | New file: Platform detection & binary resolution |

### Testing Strategy

1. **Dev mode:** Run API separately (current workflow)
2. **Packaged:** Verify API starts from bundled resources
3. **Health checks:** Confirm API responds before gateway starts
4. **Shutdown:** Verify graceful termination on app quit
5. **Error handling:** Test API crash recovery

### Package Size Impact

| Component | Size |
|-----------|------|
| Current desktop | ~110MB |
| API node_modules | ~50MB |
| Prisma engines (multi-platform) | ~30MB |
| **New total** | **~190MB** |

### PostgreSQL Distribution Options

Since PostgreSQL is still required, consider:

1. **User-provided:** Document installation requirements
2. **PostgreSQL binaries:** Bundle postgres binaries (+40MB)
3. **Docker:** Include Docker requirement (not recommended for users)
4. **Cloud fallback:** Provide hosted PostgreSQL option

### Recommended Conventional Commits

```
feat(desktop): add API sidecar for bundled API execution
feat(desktop): implement API process lifecycle management
build(desktop): package API code with desktop distribution
feat(desktop): add Prisma binary resolution for packaged app
feat(desktop): add first-run database configuration dialog
```

## Phase 3: SQLite Support (Future)

### Objective
Enable true offline capability by supporting SQLite as an alternative to PostgreSQL.

### Prerequisites
- Phase 2 complete (API sidecar working)
- SQLite-compatible Prisma schema

### Implementation Overview

1. **Dual schema support:** Maintain PostgreSQL and SQLite schemas
2. **Database router:** Detect URL scheme and instantiate correct client
3. **Type coercion:** Handle PostgreSQL-specific features in SQLite
4. **Migration path:** Support cloud → local migration
5. **Sync mechanism:** Optional bidirectional sync

### Schema Adjustments

| PostgreSQL | SQLite | Migration |
|------------|--------|-----------|
| `UUID` | `TEXT` | Store as string |
| `JSONB` | `TEXT` | Serialize to JSON |
| `ARRAY` | `TEXT` | Serialize to JSON |
| `TIMESTAMPTZ` | `TEXT` | ISO 8601 format |
| Enums | `TEXT` | String values |

### Configuration

```typescript
// Desktop uses SQLite
const databaseUrl = `file:${join(app.getPath('userData'), 'ksiegowy.db')}`;

// Cloud deployment uses PostgreSQL  
const databaseUrl = 'postgresql://user:pass@host/db';
```

## Recommended Conventional Commit Sequence

### Phase 1 (Complete)
1. `chore(desktop): scaffold electron workspace and desktop build scripts` ✅
2. `build(desktop): add localhost gateway and packaged web runtime` ✅
3. `feat(desktop): add hardened browser window and typed preload contract` ✅
4. `feat(auth): support desktop-safe oauth and localhost session flow` ✅
5. `feat(security): add os secret storage and encrypted local cache` ✅
6. `build(release): add electron-builder packaging signing and updater pipeline` ✅

### Phase 2 (Complete)
7. `feat(desktop): add API sidecar for bundled API execution` ✅
8. `feat(desktop): implement API process lifecycle management` ✅
9. `build(desktop): package API code with desktop distribution` ✅
10. `feat(desktop): add Prisma binary resolution for packaged app` ✅
11. `feat(desktop): add first-run database configuration dialog` ✅
12. `test(desktop): cover API sidecar startup and health checks` ⏳

### Phase 3 (Current)
13. `feat(api): add SQLite schema compatibility` (Next)
14. `feat(api): implement database router for multi-db support` (Next)
15. `feat(desktop): configure SQLite as default for desktop mode` (Next)
16. `feat(sync): add cloud to local data migration` (Next)
17. `feat(desktop): add offline capability verification tests` (Next)

### Documentation
18. `docs(desktop): add API sidecar architecture decision`
19. `docs(desktop): update packaging and distribution guide`
20. `docs(desktop): add first-run setup instructions`

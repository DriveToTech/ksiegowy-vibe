# Playwright E2E Testing Setup

## Context

The project is a pnpm monorepo with a Next.js 15 frontend (`apps/web`) and Fastify 5 backend (`apps/api`). Unit tests exist for the API (Vitest), but there is no frontend or e2e testing infrastructure. This plan introduces Playwright for end-to-end tests targeting the web app.

## Feasibility

**Fully feasible.** Next.js 15 + Playwright is a first-class, well-supported combination. pnpm workspaces can host a dedicated e2e package cleanly.

Main consideration: full e2e tests need both the web app and API running. In CI, this means spinning up PostgreSQL + API + web before running tests — which adds complexity but is achievable (PostgreSQL is already configured in `ci.yml` for integration tests).

---

## Implementation Plan

### 1. Create `apps/e2e` Workspace

Create a dedicated `apps/e2e/` package (not co-located with `apps/web`) to keep e2e concerns isolated.

**Files to create:**
- `apps/e2e/package.json` — declares `@playwright/test` as devDependency, defines test scripts
- `apps/e2e/playwright.config.ts` — Playwright configuration
- `apps/e2e/tests/` — test files directory (smoke test included as a baseline)
- `apps/e2e/tsconfig.json` — TypeScript config extending root

### 2. `playwright.config.ts` Configuration

Key settings:
- `baseURL`: `http://localhost:3000` (Next.js dev server)
- `webServer`: auto-start Next.js (`pnpm dev`) before tests run — so `pnpm test:e2e` works locally with one command
- Use `chromium` only in CI (faster); all browsers optionally for local runs
- `testDir`: `./tests`
- Capture screenshots and traces on failure for debugging

### 3. Root `package.json` Script

Add `"test:e2e": "pnpm --filter e2e test"` to root scripts for convenience.

### 4. Register Workspace in pnpm

Add `apps/e2e` to the `packages` list in `pnpm-workspace.yaml`.

### 5. CI Integration (`ci.yml`)

Add a new `test-e2e` job:
- Depends on the `build` job
- Spins up PostgreSQL 17 (reuse existing pattern from `test-integration`)
- Starts the API server in the background
- Installs Playwright browsers: `npx playwright install --with-deps chromium`
- Runs `pnpm test:e2e`
- Uploads Playwright HTML report as a CI artifact on failure

### 6. Smoke Test

Create `apps/e2e/tests/smoke.spec.ts` with a basic test verifying the app loads (e.g., login page is visible). This validates the full setup end-to-end without requiring authenticated flows.

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `apps/e2e/package.json` | Create |
| `apps/e2e/playwright.config.ts` | Create |
| `apps/e2e/tsconfig.json` | Create |
| `apps/e2e/tests/smoke.spec.ts` | Create |
| `pnpm-workspace.yaml` | Modify — add `apps/e2e` |
| `package.json` (root) | Modify — add `test:e2e` script |
| `.github/workflows/ci.yml` | Modify — add `test-e2e` job |

---

## Verification

1. `pnpm install` — workspace resolves `apps/e2e` without errors
2. `pnpm test:e2e` from root — Playwright auto-starts Next.js, runs smoke test, exits cleanly
3. Push to a branch — CI `test-e2e` job runs and passes
4. Break the smoke test intentionally — confirm screenshot/trace artifacts are uploaded in CI

## Current Coverage Notes

- `apps/e2e/tests/invoices.spec.ts` now covers the correction path for accepted invoices:
  create `KOR` draft from an accepted invoice, verify correction banner, issue the correction, and confirm the explicit `Wyślij korektę do KSeF` action.
- The Playwright app server must expose both `API_URL` and `NEXT_PUBLIC_API_URL` to the mock API so server-side and browser-side requests hit the same test backend.
- `apps/e2e/tests/navigation.spec.ts` scopes sidebar link interactions to the `Nawigacja dashboardu` landmark, while the desktop dashboard shell keeps the lower sidebar content scrollable so quick actions do not block clicks on shorter viewports.

## Safe demo screenshot runtime

The Playwright mock API serves only synthetic data for screenshot work. It covers the populated dashboard, issued and draft outgoing invoices, invoice detail/edit, incoming OCR review, contractor list/detail, settings (including KSeF and backup), service catalogue, and the compliance report route. See [the screenshot index](../docs/screenshots/README.md) for the fixture policy and capture commands.

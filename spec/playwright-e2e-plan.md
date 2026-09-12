# Playwright E2E Testing Setup

## Status

The planned mock-backed E2E baseline is implemented. This file retains the original setup plan; the current runtime contract is the authoritative section below.

## Context

The project is a pnpm monorepo with a Next.js 15 frontend (`apps/web`) and Fastify 5 backend (`apps/api`). API unit tests and a mock-backed Playwright suite exist; the E2E suite does not require a live API or database.

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
- `baseURL`: `http://localhost:3200` (Next.js dev server)
- `webServer`: auto-start the mock API on `3199` and Next.js dev server on `3200`; both `API_URL` and `NEXT_PUBLIC_API_URL` point to the mock API
- Use the configured `chromium` project by default; `chromium-linux` is added only when `VISUAL_REGRESSION=true`
- `testDir`: `./tests`
- `workers`: `1` in local and CI runs because the mock API keeps mutable fixture maps in one process
- Capture screenshots and traces on failure for debugging

### 3. Root `package.json` Script

Add `"test:e2e": "pnpm --filter @ksiegowy/e2e test"` to root scripts for convenience.

### 4. Register Workspace in pnpm

Add `apps/e2e` to the `packages` list in `pnpm-workspace.yaml`.

### 5. CI Integration (`ci.yml`)

Add a new `test-e2e` job:
- Depends on the `build` job
- Uses the Playwright mock API and Next.js web server from `playwright.config.ts`; PostgreSQL is not required
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
- `apps/e2e/tests/mobile-regression.spec.ts` covers 320, 360, 390, and 430px viewports in light and dark themes, including the five-slot reference mobile navigation with its centered 52px AI assistant placeholder, `Więcej` sheet, passive environment indicator, header controls, safe-area clearance, and mobile route flows.

## Safe demo screenshot runtime

The Playwright mock API serves only synthetic data for screenshot work. It covers the populated dashboard, issued and draft outgoing invoices, invoice detail/edit, incoming OCR review, contractor list/detail, settings (including KSeF and backup), service catalogue, and the compliance report route. See [the screenshot index](../docs/screenshots/README.md) for the fixture policy and capture commands.

Visual dashboard baselines use the pinned `mcr.microsoft.com/playwright:v1.59.1-noble` image with `VISUAL_REGRESSION=true` and the `chromium-linux` project. Update and verification commands are documented in [`apps/e2e/PLAYWRIGHT_TESTS_SPEC.md`](../apps/e2e/PLAYWRIGHT_TESTS_SPEC.md#visual-regression).

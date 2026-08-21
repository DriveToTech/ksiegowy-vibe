# Task 7 Review Blockers Implementation Plan

> **For agentic workers:** Implement the checklist in this plan in the current branch without committing.

**Goal:** Prevent mobile dashboard content from being obscured, keep mobile navigation labels readable and accessible, and make Playwright visual baselines reproducible.

**Architecture:** Keep the existing `DashboardShell` and `DashboardNavigation` ownership. Make the mobile shell a bounded scroll region with the persistent navigation in normal flow, assert content/action separation at initial and mid-scroll positions, pin the existing Playwright dependency to the lockfile resolution, and run visual generation inside the pinned Playwright Docker image.

**Tech Stack:** Next.js, React, Tailwind CSS, Playwright 1.59.1, pnpm, Docker.

---

### Task 1: Fix mobile shell clearance and navigation labels

**Files:**
- Modify: `apps/web/src/components/organisms/DashboardShell.tsx`
- Modify: `apps/web/src/components/organisms/DashboardNavigation.tsx`

- [x] Put mobile content in a bounded scroll region with the persistent navigation in a reserved flow region, preserving the existing desktop behavior.
- [x] Replace mobile blanket truncation with wrapping text while retaining semantic link names and at least 44px targets.

### Task 2: Add the mobile overlap regression assertion

**Files:**
- Modify: `apps/e2e/tests/dashboard.spec.ts`

- [x] Add a mobile test that compares meaningful dashboard content and contextual action bounds with the navigation at initial and mid-scroll positions.
- [x] Assert every visible meaningful content/action bound ends above the navigation bound, allowing the reserved flow region to be regression-tested in the browser.

### Task 3: Pin Playwright and document reproducible visual commands

**Files:**
- Modify: `apps/e2e/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `README.md`
- Modify: `spec/ui/06-quality-verification.md`

- [x] Change `@playwright/test` from the range `^1.50.0` to exact `1.59.1` without adding dependencies.
- [x] Update visual generation and no-update verification commands to use `mcr.microsoft.com/playwright:v1.59.1-noble`.
- [x] Document that the image, package version, and lockfile resolution must match.

### Task 4: Regenerate, inspect, and verify

**Files:**
- Regenerate: `apps/e2e/tests/dashboard.spec.ts-snapshots/*.png`

- [x] Generate the three baselines in the pinned Docker image.
- [x] Manually inspect all three images.
- [x] Run no-update visual verification.
- [x] Run web checks and the relevant E2E checks.
- [x] Report exact commands, results, and changed files; do not commit.

Verification: baseline generation passed 3 tests; pinned no-update verification passed 3 tests; web typecheck and lint passed; dashboard/navigation E2E passed 27 tests with 3 expected visual skips. No commit was created.

### Task 5: Compose the authenticated mobile app header into two rows

**Files:**
- Modify: `apps/web/src/components/organisms/AppHeader.tsx`
- Modify: `apps/web/src/components/KsefEnvironmentSwitcher.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/e2e/tests/dashboard.spec.ts`

- [x] Keep desktop header composition unchanged while assigning the mobile brand, theme/session, company, and KSeF groups to two grid rows.
- [x] Keep compact KSeF controls readable and preserve 44px interactive targets.
- [x] Assert the four authenticated mobile header groups occupy at most two row bounds and do not overflow 390px.
- [x] Regenerate and review the three pinned baselines, then pass no-update visual verification.

Verification: full E2E passed 47 tests with 3 expected visual skips; pinned no-update visual verification passed 3 tests; web typecheck and lint passed; `git diff --check` passed. No commit was created.

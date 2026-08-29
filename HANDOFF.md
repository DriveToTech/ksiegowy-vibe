# Handoff — Personal Mode (Household Budgeting), Phase 2

## Phase 2 — Savings & Goals completed

Phase 2 is implemented in the current uncommitted worktree. Shipped scope:

- `Goal`, `GoalMovement`, and `GoalAutomationRule` models and migrations.
- Goal CRUD, lifecycle (`ACTIVE`, `PAUSED`, `COMPLETED`, `ARCHIVED`), movement
  history, add/withdraw transfers, target validation, and competing-goal allocation.
- Fixed-day, percentage-of-income-over-threshold, and round-up automations,
  including automation identity, tombstones, cursors, idempotency, and bounded catch-up.
- Fixed-rule-only projections with explicit limits for variable rules.
- Thin Fastify goal controllers and live household membership/visibility checks.
- Daily Europe/Warsaw goal-automation cron at 04:00, alongside the existing household jobs.
- Goals frontend routes, forms, detail/lifecycle/movement/automation components,
  error states, mobile Goals/More navigation, accessibility states, API client/types,
  mock fixtures, and Playwright E2E coverage.

`HouseholdFileRecord` and receipt/document attachments remain deferred; Phase 2 did not ship that separate slice.

## Approved minimal frontend pass — 2026-08-28

Implemented in `apps/web`: narrow transaction edits with transfer-leg safety,
supported-only transaction controls, robust AccountPicker listbox behavior,
mobile `Dodaj płatność` navigation, route error propagation, Polish decimal and
calendar-date handling, weekly commitments, commitment validation, neutral
transfer styling, and shared percentage formatting. Focused web tests cover the
decimal/date/percentage formatting and commitment validation paths. See
`docs/specs/household-frontend.md` for the behavior handoff.

## UX audit fix pass #2 (this session)

Fixed every blocking/should-fix finding from the second UX audit pass (color/date-locale
systemic fixes, ledger footer totals, mobile bottom nav, dashboard/ledger/forms/commitments/
onboarding polish — see the session transcript for the full finding list and file-by-file
detail). Explicitly skipped, per the audit's own instruction not to half-build it: the
"Rozłóż koszt w budżecie" (spread cost across billing period) toggle — `commitment.service.ts`
and the Prisma schema have no billing-period-spread concept at all, so this needs a real
domain-model decision, not a UI-only stub. Everything else in that pass's scope is done.
The current tree includes the approved frontend pass and the permanent
`apps/e2e/tests/household-phase1-ux.spec.ts`. The temporary
`apps/e2e/tests/ux-audit-capture.spec.ts` and `apps/e2e/ux-audit-screenshots/`
are absent. Working tree changes are not committed or pushed.

## Where things are

- **Worktree**: `.worktree/personal-mode-household` (this directory), sibling to the main checkout.
- **Branch**: `feature/personal-mode-household`, branched off `design/improvements`.
- **Latest commit**: `b42894483c1c1fd25ac70f0ca3ff41a6ea79fe26` — `fix(household): harden Phase 1 frontend UX and accessibility` (Maciej Trybuła, 2026-08-29 06:07:22 +0200). Phase 2 and the current frontend UX pass are uncommitted.
- **Not pushed, no PR yet.**
- **Plan file** (full architecture, decisions, and rationale — read this first): `/Users/maciejtrybula/.claude/plans/mutable-brewing-rabin.md`. It was reviewed and signed off by both backend-architect and frontend-architect before implementation; every non-obvious design choice (separate database, `services/*` package layer, transfer model, no JWT household claim, etc.) is explained there with reasoning. Don't re-litigate it without a real reason.
- **Design source**: `docs/redesign/kv-redesign-platform-personal.html` (personal-mode section starts ~line 2032, screens 20–32). Phase 1 UI scope is screens 20, 21, 22, 26, 27, 28, 29, 30; goals (23/24/31/32) are now implemented in Phase 2 and investing (25) remains Phase 3.

## What's actually done

- `services/household` package: full domain model including Goal, GoalMovement, and GoalAutomationRule; household/backend coverage is included in the 349 passing non-E2E tests reported below.
- Separate `ksiegowy_household` Postgres database, wired through docker-compose, CI, backups.
- `apps/api/src/routes/household/*` thin controllers, live-DB membership guard (no JWT claim), household cron jobs.
- `/household` frontend route tree: dashboard, ledger (list/detail/new/import), envelopes (read-only), commitments (list/detail/new), settings, onboarding. Mode switch, green theme, household switcher.
- Company-vs-household onboarding entrypoint at `/onboarding`.
- Playwright E2E: Phase 1 coverage (7/7 in final verification), Goals coverage (9/9 serially and 9/9 in parallel).
- One full round of post-build bug fixing already done in this session (see "Bugs already found and fixed" below) plus one full UX-audit-driven fix pass (see "UX audit fixes already applied").

**Latest final verification**: recursive typecheck passed for 9/9 scoped projects, recursive lint passed for 9/9, and non-E2E tests passed with 349 passed, 0 failed, and 1 skipped. The root test script duplicated execution in its raw output; 349 is the unique passing-test count, not 698. The web build passed with a warning that the Next.js ESLint plugin was not detected. Goals E2E passed 9/9 serially and 9/9 in parallel; Phase 1 household regression passed 7/7. `git diff --check` passed. Prisma schema validation passed after loading `.env`; migration status/integration deployment was blocked because `localhost:55433` was unavailable and `HOUSEHOLD_INTEGRATION_DATABASE_URL` was unset. No production security sign-off is implied.

## What's NOT done

**Phase 3 (investing, reports)**: not started. `HouseholdFileRecord` receipt/document attachments remain separately deferred.

**Deferred Phase 1 UI polish** (explicitly out of scope for the fix pass that just landed, not silently dropped — a UX audit agent found these, listed here so they don't get lost):
- Receipt/OCR capture, document drop zones — separately deferred (`HouseholdFileRecord`); not shipped with Goals Phase 2.
- Advisor nudge components (budget/goal suggestions) — no advisor feature exists yet anywhere in scope.
- "This payee" spending stats and transaction History timeline on the transaction detail view — need new backend endpoints that don't exist yet.
- Balance-after on transaction detail — not honestly computable without a running-balance/snapshot endpoint.
- Ledger's left-rail quick-filter list (Needs a category / Recurring / Over 500 / Anna's card) — a working filter bar + pagination was built instead, the mockup's exact left-rail treatment was skipped.
- Commitment register's rail summary cards, four type-summary tiles, and `9 OF 14 SHOWN · YEARLY COST 50 508 ZŁ` footer — list + detail views work, these summary widgets don't exist.
- Full mobile bottom-nav redesign beyond the shipped five-position household navigation — deferred.
- Multi-currency, category auto-suggestion rules UI, "Save and add another" secondary buttons, month-context dashboard header line — all skipped per the plan's or the audit's explicit scope calls.
- Budget envelope create/edit form — `envelopes/page.tsx` is read-only; envelopes can only be created via seed data or a future form.
- Commitment editing (full edit, not just Pause/Resume/End) — not built.
- `apps/e2e/mock-api/server.js`'s transactions handler doesn't implement pagination/filter query params the way the real backend now does (it's a simpler stub) — fine for the existing tests, but a trap if someone writes a new e2e test assuming filter behavior works against the mock.

**Review and release status**:
- A fresh UX review was performed after the fix pass, but it could not capture a live viewport because port `3010` was not running.
- Introduced Phase 2 residuals: projections intentionally cover fixed rules only; percentage and round-up rules are not forecast; automation catch-up and round-up processing are bounded (36 months / 500 source transactions per rule per run); goal movement history is capped at 100 rows in detail views. These are product limits, not security sign-off.
- Pre-existing security-review risks remain separate from Phase 2: refresh-token revocation, cross-household category relations, commitment term limits, and manual transfer/import replay. Transfer `PATCH` remains permitted by the backend, and the web build warns that the Next ESLint plugin was not detected.
- Integration prerequisites remain: `HOUSEHOLD_DATABASE_URL` must point to a reachable database and the household migrations must be deployed before API startup; OAuth testing on these worktree ports still requires the documented Google redirect URI.
- Full E2E remains a separate diagnostic from the focused Phase 2 gates: serial runs reported 66 passed, 3 failed, and 3 skipped; parallel runs reported 55 passed, 14 failed, and 3 skipped. Persistent failures are `dashboard.spec.ts:342` (expects `/onboarding`, received `/onboarding/company`) and `navigation.spec.ts:9` and `:79` (expect 5 links, received 6 including Compliance). The additional parallel-only failures are caused by shared mutable mock state. These failures do not change the focused Goals or final Phase 1 regression results and should not be read as a production or full-suite security sign-off.
- Nothing pushed, no PR opened against `design/improvements`.
- Google Cloud Console: if you're testing OAuth login against this worktree's ports, the redirect URI `http://localhost:3011/auth/google/callback` needs to be added to the OAuth client's Authorized redirect URIs list (Console-side, can't be done from code) — this was already communicated to the user mid-session, may or may not be done on their end.

## How to run this worktree

Ports are set in this worktree's own `.env` (gitignored, local-only) to avoid colliding with other running stacks:
- Web: `http://localhost:3010`
- API: `http://localhost:3011`
- Postgres: `localhost:55433`
- Adminer (`docker compose --profile tools up -d`): `http://localhost:8081`

```bash
cd .worktree/personal-mode-household
docker compose up -d --build
# first time / after a fresh volume:
set -a && . ./.env && set +a
pnpm --filter @ksiegowy/api exec prisma migrate deploy
pnpm --filter @ksiegowy/household-service exec prisma migrate deploy --schema prisma/schema.prisma
```

Verification commands:
```bash
pnpm -r --if-present typecheck
pnpm -r --if-present lint
pnpm -r --if-present --filter '!@ksiegowy/e2e' test
pnpm --filter @ksiegowy/web build
pnpm --filter @ksiegowy/e2e exec playwright test household --workers=1
pnpm --filter @ksiegowy/e2e test -- tests/household-phase1-ux.spec.ts
git diff --check
```

## Bugs already found and fixed this session (don't re-report these)

1. ESLint choked on the generated Prisma client (`**/generated/**` missing from root `eslint.config.mjs` ignores) — fixed.
2. `apps/api/Dockerfile` never copied/built `services/household` — fixed, image builds and boots clean.
3. Dashboard API response was missing `moneyIn`/`moneyOut`/`netWorth`/`savingsRate*` and had truncated account/envelope shapes vs. what the frontend expected — fixed, frontend types reconciled to match.
4. `GET /households/:id/members` was called by the frontend but never registered as a route — added.
5. `docker-compose.yml` only parameterized the Postgres port, not api/web/adminer — parameterized all four, including the `CORS_ORIGIN`/`NEXT_PUBLIC_API_URL`/`APP_URL` cascade that depends on them.
6. `.env`'s `APP_URL`/`GOOGLE_REDIRECT_URI`/`GDRIVE_REDIRECT_URI`/`DATABASE_URL` had plain hardcoded default ports that bypassed the `docker-compose.yml` templating (env_file values aren't substituted) — fixed for this worktree's actual ports.
7. `/household/onboarding/household` was an infinite redirect loop — `household/layout.tsx`'s guard wrapped its own onboarding target. Fixed via a `(app)` route group so the guard no longer wraps `onboarding/`.

## UX audit fixes already applied (this was NOT just "later polish" — see full findings in the earlier session transcript if you need the original detail)

Mode-default-to-purple bug (new `middleware.ts`), `AccountPicker` rebuilt from a bare `<select>` into a proper accessible listbox showing balance/mask/badges, `TransactionForm` restructured with a three-way Money out/Money in/Transfer control and real transfer support, transaction and commitment detail views built from scratch (previously just a form/key-value dump), ledger filters + pagination wired to the real (already-fixed) paginated backend endpoint, a real accessibility bug in the shared `FormField` component (missing `htmlFor`/`id` association) fixed app-wide, dashboard free wins (`savingsRatePercent` etc. now rendered, empty states added). Full detail is in the plan file's implicit history / the session transcript that produced commit `1b5261c`.

## Earlier UX audit context

The earlier UX audit identified 2 blocking, 31 should-fix, and 10 nice-to-have
findings. The blocking and should-fix findings were addressed in the fix pass;
the nice-to-have items below remain explicitly deferred. The temporary capture
spec and screenshot directory used during that audit are no longer present.

Also fixed along the way: `apps/e2e/mock-api/server.js` was missing single-item GET handlers for `/households/:id/transactions/:transactionId` and `/households/:id/commitments/:commitmentId` (the exact gap this file's line 39 already flagged as "a trap if someone writes a new e2e test assuming filter behavior works") — added both.

Nice-to-have findings explicitly deferred, not silently dropped:
- Envelope headroom sentence ("96 zł left, 6 days to go") on transaction detail's envelope card.
- Savings-rate "+0.0%" delta suppression is covered in the fix pass for the net-worth card; the *sidebar* KONTA card's empty vertical space is separately deferred.
- Primary-CTA vs mode-identity green color collision — systemic token question (do action buttons and the personal-mode identity color need to be visually distinct?), needs a real design decision, not a quick fix.
- Commitment type chips missing color swatches.
- Onboarding reassurance copy ("nothing here touches your company...").
- Tag column removal is in the fix pass; adding an actual tags feature is not.

Two systemic root causes behind a chunk of the earlier findings were fixed in the pass: (1) red/negative-value color existed but was not wired into the ledger table or dashboard safe-to-spend card, and (2) date inputs rendered US `mm/dd/yyyy` instead of Polish `dd.mm.yyyy`.

## Suggested next steps, in order

1. ~~Fresh visual/UX pass~~ — done. No live viewport was captured because port `3010` was not running; implementation review found no blocker.
2. Push + open PR against `design/improvements` once the uncommitted Phase 2 work is reviewed and verified.
3. Plan Phase 3 investing and reports; keep `HouseholdFileRecord` separately tracked rather than implying it shipped with Goals.

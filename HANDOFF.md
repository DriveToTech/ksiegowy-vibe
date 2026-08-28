# Handoff — Personal Mode (Household Budgeting), Phase 1

## UX audit fix pass #2 (this session)

Fixed every blocking/should-fix finding from the second UX audit pass (color/date-locale
systemic fixes, ledger footer totals, mobile bottom nav, dashboard/ledger/forms/commitments/
onboarding polish — see the session transcript for the full finding list and file-by-file
detail). Explicitly skipped, per the audit's own instruction not to half-build it: the
"Rozłóż koszt w budżecie" (spread cost across billing period) toggle — `commitment.service.ts`
and the Prisma schema have no billing-period-spread concept at all, so this needs a real
domain-model decision, not a UI-only stub. Everything else in that pass's scope is done.
Working tree is **not** clean as of this section — see `git status` for the touched files
(not yet committed as of writing this).

## Where things are

- **Worktree**: `.worktree/personal-mode-household` (this directory), sibling to the main checkout.
- **Branch**: `feature/personal-mode-household`, branched off `design/improvements`.
- **Latest commit**: `1b5261c` — `feat(household): add personal mode Phase 1 — ledger, envelopes, commitments`. Working tree is clean as of this commit.
- **Not pushed, no PR yet.**
- **Plan file** (full architecture, decisions, and rationale — read this first): `/Users/maciejtrybula/.claude/plans/mutable-brewing-rabin.md`. It was reviewed and signed off by both backend-architect and frontend-architect before implementation; every non-obvious design choice (separate database, `services/*` package layer, transfer model, no JWT household claim, etc.) is explained there with reasoning. Don't re-litigate it without a real reason.
- **Design source**: `docs/redesign/kv-redesign-platform-personal.html` (personal-mode section starts ~line 2032, screens 20–32). Phase 1 UI scope is screens 20, 21, 22, 26, 27, 28, 29, 30 — 23/24/31/32 (goals) and 25 (investing) are Phase 2/3.

## What's actually done (Phase 1)

- `services/household` package: full domain model (Household, HouseholdMembership, HouseholdAccount, HouseholdCategory, HouseholdTransaction with transfers, BudgetEnvelope, Commitment, CategorizationRule), 57 passing unit tests.
- Separate `ksiegowy_household` Postgres database, wired through docker-compose, CI, backups.
- `apps/api/src/routes/household/*` thin controllers, live-DB membership guard (no JWT claim), household cron jobs.
- `/household` frontend route tree: dashboard, ledger (list/detail/new/import), envelopes (read-only), commitments (list/detail/new), settings, onboarding. Mode switch, green theme, household switcher.
- Company-vs-household onboarding entrypoint at `/onboarding`.
- Playwright e2e: `household-ledger.spec.ts`, `household-onboarding-entrypoint.spec.ts` (4 tests, passing).
- One full round of post-build bug fixing already done in this session (see "Bugs already found and fixed" below) plus one full UX-audit-driven fix pass (see "UX audit fixes already applied").

**Independent verification as of the last commit** (I re-ran this myself, not just trusting subagent reports): `pnpm -r typecheck`, `pnpm -r lint`, and every unit/integration test suite (household-service 57, api 121, shared-utils 62, fa3-xml 55) all pass. Live Docker stack sanity-checked (`/`, `/dashboard`, `/household`, `/login`, api `/ready` all return 200).

## What's NOT done

**Phase 2 (savings & goals) and Phase 3 (investing, reports)**: not started at all. See the plan's "Phased Delivery Checklist" for the task breakdown.

**Deferred Phase 1 UI polish** (explicitly out of scope for the fix pass that just landed, not silently dropped — a UX audit agent found these, listed here so they don't get lost):
- Receipt/OCR capture, document drop zones — correctly deferred to Phase 2 (`HouseholdFileRecord`).
- Advisor nudge components (budget/goal suggestions) — no advisor feature exists yet anywhere in scope.
- "This payee" spending stats and transaction History timeline on the transaction detail view — need new backend endpoints that don't exist yet.
- Balance-after on transaction detail — not honestly computable without a running-balance/snapshot endpoint.
- Ledger's left-rail quick-filter list (Needs a category / Recurring / Over 500 / Anna's card) — a working filter bar + pagination was built instead, the mockup's exact left-rail treatment was skipped.
- Commitment register's rail summary cards, four type-summary tiles, and `9 OF 14 SHOWN · YEARLY COST 50 508 ZŁ` footer — list + detail views work, these summary widgets don't exist.
- Mobile bottom-nav redesign (Home/Ledger/**+FAB**/Goals/More) — still the flat 5-link business-style grid.
- Multi-currency, category auto-suggestion rules UI, "Save and add another" secondary buttons, month-context dashboard header line — all skipped per the plan's or the audit's explicit scope calls.
- Budget envelope create/edit form — `envelopes/page.tsx` is read-only; envelopes can only be created via seed data or a future form.
- Commitment editing (full edit, not just Pause/Resume/End) — not built.
- `apps/e2e/mock-api/server.js`'s transactions handler doesn't implement pagination/filter query params the way the real backend now does (it's a simpler stub) — fine for the existing tests, but a trap if someone writes a new e2e test assuming filter behavior works against the mock.
- `CommitmentBillingFrequency` frontend type is missing `WEEKLY` (backend has it) — minor, pre-existing, not touched.

**Process gaps**:
- **No second design review of the fix pass.** ux-ui-architect did the original audit (found the real gaps); frontend-engineer then fixed them; I verified functionally (typecheck/lint/test/live curl) but nobody has done a fresh visual/UX pass against the *current* state to confirm the fixes actually match the mockup's intent, not just that they don't crash. Worth doing before calling Phase 1 fully done, especially for the AccountPicker rebuild, TransactionForm restructure, and both new detail views.
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
pnpm --filter @ksiegowy/e2e test -- household
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

## Second UX audit (this session) — done, no live OAuth needed

Ran the fresh visual/UX pass without real Google login: `apps/e2e/tests/ux-audit-capture.spec.ts` (temp script, mock-API-backed, same journey as `household-ledger.spec.ts` — create household/accounts/transaction/commitment/transfer) captured full-page screenshots of all Phase 1 UI scope screens (20-30) into `apps/e2e/ux-audit-screenshots/`, ux-ui-architect compared each against the mockup. Delete the temp spec once the fix pass below is verified and merged — it's not meant to be permanent.

Also fixed along the way: `apps/e2e/mock-api/server.js` was missing single-item GET handlers for `/households/:id/transactions/:transactionId` and `/households/:id/commitments/:commitmentId` (the exact gap this file's line 39 already flagged as "a trap if someone writes a new e2e test assuming filter behavior works") — added both.

**Findings: 2 blocking, 31 should-fix, 10 nice-to-have.** Blocking + should-fix delegated to frontend-engineer as one fix pass (in progress/done — check its report). Nice-to-have explicitly deferred, not silently dropped:
- Envelope headroom sentence ("96 zł left, 6 days to go") on transaction detail's envelope card.
- Savings-rate "+0.0%" delta suppression is covered in the fix pass for the net-worth card; the *sidebar* KONTA card's empty vertical space is separately deferred.
- Primary-CTA vs mode-identity green color collision — systemic token question (do action buttons and the personal-mode identity color need to be visually distinct?), needs a real design decision, not a quick fix.
- Commitment type chips missing color swatches.
- Onboarding reassurance copy ("nothing here touches your company...").
- Tag column removal is in the fix pass; adding an actual tags feature is not.

Two systemic root causes behind a chunk of the findings: (1) red/negative-value color exists (used correctly on transaction detail) but wasn't wired into the ledger table or the dashboard safe-to-spend card, (2) date inputs render US `mm/dd/yyyy` instead of Polish `dd.mm.yyyy` — both are fix-pass item A/B, fixing them once should cascade across several findings.

## Suggested next steps, in order

1. ~~Fresh visual/UX pass~~ — done, see above. Verify the frontend-engineer fix pass actually resolved the findings (rerun the capture script, spot-check screenshots) before treating Phase 1 as UX-signed-off.
2. Push + open PR against `design/improvements` once the fix pass is verified (typecheck/lint/e2e green).
3. Start Phase 2 (savings & goals) per the plan's checklist — `Goal`, `GoalAutomationRule`, `GoalMovement` models, same package-then-controller delegation order used for Phase 1. Note: `GoalAutomationRule`'s cron idempotency model isn't fully specified in the plan the way `Commitment`'s `@@unique([commitmentId,date])` is — worth a quick backend-architect check before implementation.

# Aurora Solid Redesign — Implementation Plan

## Status
- Overall: `done` — all 6 phases landed. Two items routed to **ux-ui-architect** as follow-ups (see Phase 5), neither blocking.
- Phase 0: `done` — token spec + light theme + frontend-architect addendum (`@theme inline` mapping, radius sweep, commit order) all landed in `docs/specs/aurora-solid-tokens.md`. All blockers from the feasibility review resolved, incl. one real bug caught in the fix pass (status fills spec'd as `rgba()` would have rendered invisible at existing `/25` opacity call sites — corrected to pre-composited opaque hexes).
- Phase 1: `done` — all 6 commits landed (`06348a2` C1 font swap, `4620c28` C2 token repoint, `9c9e0fb` C3 status tokens + modifier strip, `5f88c26` C4 Surface rebuild + Banner molecule, `7ef0226` C5 atoms/molecules/organisms retone, `26d1ba2` C6 e2e assertion update). Verification clean: typecheck, build, `apps/e2e` 47 passed/3 skipped (visual-regression gated), `blur(`/`backdrop-filter` sweep empty. Noted deviations: Button radius kept uniform across sizes (avoids a `cn()` class-precedence fight); Badge's `neutral` tone renamed `draft` (matches actual usage, per Addendum A5); MetricCard kept as icon container, not the mock's 7px status-square primitive (that's KPI-grid layout, Phase 2 scope); `navigation.spec.ts` also fixed (not in original change-set, broken by the same C5 retone — a Chromium stale-computed-style quirk on the active nav item). Open for Phase 2: `.app-frame` CSS rule exists but has no consuming JSX yet (chrome bar/rail is Phase 2/3 layout work); `offline24` Badge tone and KsefEnvironmentSwitcher are wired but have no exercising call site yet.
- Phase 2: `done` — batch A (sign-in, overview, outgoing invoices, new/edit invoice, invoice detail) landed in 7 commits (`407ef26` shell/chrome-bar/rail rebuild, `4e202a0` sign-in split panel, `8aa1bb9` Overview KPI grid/chart/attention list, `307b811` outgoing invoices table, `34bb415` new/edit invoice two-column layout, `6b9102e` invoice detail + ClearanceStepper molecule, `3283faa` empty-state fix + e2e updates). Verification clean: typecheck, build, `apps/e2e` 47 passed/3 skipped (visual-regression gated), `blur(`/`backdrop-filter` sweep empty. New molecule: `ClearanceStepper` (genuinely missing, checked `src/components/molecules` first). Real API gaps found and flagged, not worked around with fake data: (1) the mock's "offline24" concept has no backing field anywhere in the API — KPI grid's 4th cell uses the real `not_submitted` KSeF status instead; (2) `GET /companies/:id/invoices` (list endpoint) does not select `paymentReceived`/`paymentDueDate`, only the detail endpoint does, so the outgoing-invoices Payment column and Overview's "needs attention" list can only show DRAFT/BLOCKED states, not true paid/unpaid/overdue — user decision: backlog, see Backlog section. Scope trims (no backend to back them, user decision: backlog epic, not dropped from design intent): bulk-selection/bulk-action bar and free-text search/saved-views on the outgoing invoices list. Dropped permanently (not backend gaps, just mock elements that don't map to anything real): the mock's fabricated KSeF-preflight checklist (buyer whitelist, certificate validity) in favor of a real, live-computed blocker list (missing contractor/line items/price) on new/edit invoice; the invoice-detail "Activity" log (no audit-log data source); sign-in's decorative email/password fields and second SSO button (app only implements Google OAuth).
- Phase 3: `done` — batch B (incoming list, OCR review 3-column split, contractors + service-catalog split panels, settings rail sub-nav) landed in 6 commits (`e432af3` incoming list, `8b9dcaf` OCR review 3-column, `7548174` contractors split panel, `9283c65` service-catalog split panel, `76742f7` settings sub-nav, `3a79134` e2e updates). Verification clean: typecheck, build, `apps/e2e` 47 passed/3 skipped (visual-regression gated; one isolated-parallel-load flake on an unrelated `/dashboard` test, unaffected by this batch), `blur(`/`backdrop-filter` sweep empty. Contractors/service-catalog split panels compared after both were built and correctly kept separate, not extracted — contractors' detail is read-only + links to an edit route, service-catalog's detail *is* the edit form with create/archive wired in, they only share the grid shape. Multiple real API/schema gaps found and dropped rather than faked (see Backlog) — incoming auto-fetch schedule, OCR-suggested categorization, VAT/category KPI aggregation, contractor turnover/balance/payment-terms, service-template pricing/code/usage-count fields, Settings' Notifications and API & webhooks sections (no backend, also outside task scope).
- Phase 4: `done` — 6 commits landed (`cb968e0` configurable redirect on reused forms, `473fa0b` OnboardingStepRail organism, `cc0bc1e` `/onboarding` top-level route + company/ksef/team steps, `e2108cb` dashboard→onboarding redirect, `15e7272` e2e fix for the redirect). Verification clean: typecheck, build (all 4 onboarding routes present), `apps/e2e` 47/3 skipped, `blur(`/`backdrop-filter` sweep empty. Auth-refresh-then-navigate sequence traced end to end through unmodified `refreshBrowserSession`/`session/refresh` route — not live-DB-verified in this environment, but the mechanism was already exercised by the existing settings-page company-creation flow, only its redirect target was parameterized. Deviations: `OnboardingStepRail` derives current step from `usePathname()` (same pattern as `DashboardNavigation`) rather than a layout-passed prop; step 3's "Continue" is implicit (redirect-on-success) since the reused form has no unified footer nav; no Back buttons (not in the design doc's component boundaries, YAGNI); no fixed card height (mock's 1280×800 is gallery sizing). **Found, not fixed**: the invite link the wizard now surfaces (`/invite/{token}`) has no accept page anywhere in `apps/web/src/app` — a pre-existing gap in the invite feature (predates this redesign, `MembersTab` already generates these links), now more visible because onboarding makes it a first-run path. See Backlog. e2e coverage added (`e0d84f8` `apps/e2e/tests/onboarding.spec.ts`): full first-run flow incl. the JWT-staleness regression check (asserted via DOM state, not network interception — the ksef step's data fetch runs inside a React Server Component so `page.waitForResponse` can't see it), "Save and finish later", mock-api extended with 6 new endpoints that genuinely model the auth-refresh requirement (a token not yet refreshed gets a real 403 from the mock, not just a trusted redirect). Stable across 5 solo runs + 2 full-suite runs. One dev-server-only flake pattern documented in the test file for future onboarding e2e work: Next's on-demand route compilation can race a Fast Refresh remount right after navigating to a new step, silently dropping the first keystroke — worked around with a `networkidle` settle before filling each step's form; shouldn't affect a built/production app. No backend work needed: `/onboarding` top-level route (outside `DashboardShell`), URL-driven steps (no client wizard state), "Save and finish later" is just a link to `/dashboard` (each step already commits to the DB on its own submit), `CompanyDetailsForm`/`KsefSettingsForm` reused with a `redirectTo` prop, `MembersTab` NOT reused (30-line invite form vs 254-line member management). The required post-company-creation auth-refresh (JWT goes stale after `POST /companies`, would 403 step 3/4) is already implemented in `CompanyDetailsForm.tsx:83` — just needs its hardcoded redirect target made a prop, must stay a full-page navigation. Endpoint corrections: KSeF settings is `PATCH` not `PUT`, invite creation is `POST /companies/:companyId/invites` (not `.../members`, which doesn't exist), accept is `/invites/:token/accept`. Invoice numbering scoped OUT of the wizard (has a default, own settings editor). Flagged for later: step 4 sends no email (no mail implementation in the API) — UI must show a copyable invite link, not claim one was emailed.
- Phase 5: `done` — accessibility/regression pass and docs. **Verification all green**: `web typecheck` 0, `web build` 0, `pnpm build` (monorepo) 0, `apps/e2e` 49 passed / 3 skipped (visual-regression gated) / 0 failed. Two transient failures investigated and dismissed with evidence, not assumed: the monorepo build failed on `@ksiegowy/api` (`Module '@prisma/client' has no exported member 'Prisma'`) — `apps/api` is untouched on this branch (`git diff main...HEAD -- apps/api` empty) and `prisma generate` fixed it, i.e. stale local codegen, not a regression; and `dashboard.spec.ts:528` (mobile sticky header) failed once in the full parallel run but passed 3/3 in isolation — the same parallel-load flake already documented in Phase 3.
  - **Light theme verified against real screens, not token math.** Captured full-page screenshots at 1440×1000 across login, overview, invoice detail, contractors, service-catalog, settings, incoming and the onboarding wizard, plus a programmatic contrast probe over every interactive element on 7 routes in *both* themes. No text or interactive-boundary contrast failure found. (The probe's initial "failures" were all primary gradient buttons reporting ~1.0–1.2 in *both* themes — a probe blind spot, since it reads `background-color` and the gradient is `background-image`. Phase 0 §7 already measured those pairings at 4.96/4.91 light and 8.32/7.92 dark.) Split panels, clearance stepper rails, status chips on `inset`, and the KPI grid all read correctly in light.
  - **Dead-code sweep clean**: `blur(`/`backdrop-filter`/`backdrop-blur` → nothing; `shadow-aura`/`shadow-soft`/`aura` by name → nothing; `error-action-ink`/`success-soft`/`error-soft`/`font-display`/`font-inter`/`font-manrope`/`radius-md`/`radius-lg`/`radius-xl` → nothing. `shadow-` survives only as `--shadow-frame` on the three page frames (login, onboarding, dashboard shell), which is the spec. Fixed directly: 3 leftover `rounded-md` sites (`InvoiceActions.tsx:328`, `ReviewPanel.tsx:285,290`) → `rounded-chip`; they were silently resolving to Tailwind's default 0.375rem after `--radius-md` was deleted — visually identical, but exactly the silent-fallback case Addendum A1 warned about. The remaining `rounded-[2px]`/`rounded-[7px]` literals are intentional sub-chip micro-shapes (7px status squares, the 22px step-rail icon) taken straight from the mock, not scale violations.
  - **Docs updated**: `README.md` — "Frontend Branding" replaced by "Frontend Design System" (names Aurora Solid, points at both source-of-truth specs, corrects "sidebar contains navigation only" which is no longer true now the rail carries JPK/rejected widgets) plus a new "First-Run Flow" section documenting the onboarding path and why there is no stored progress. `docs/architecture.md` — auth sequence diagram extended with the first-run `/onboarding` branch and the post-`POST /companies` session re-mint. Superseded banners added to `spec/stitch-ui-implementation-plan.md` and all 7 files in `spec/ui/` (kept as historical record per this plan's header, not deleted).
  - **Routed to ux-ui-architect, not fixed here** (both are design-asset/judgment calls outside a review gate's authority): (1) `logo.png` is a single asset with no light-theme variant — the "Vibe" half of the wordmark is near-invisible on the light chrome bar, on every screen. Pre-existing (one asset since the beginning) but far more visible now the chrome bar is `#F4F6FC`. Needs a light variant or a themed SVG wordmark; `BrandImage.tsx` has no theme awareness to hang it on yet. (2) Secondary/outline buttons ("Pobierz dane po NIP", "+ Dodaj usługę", "Pobierz PDF") read as *disabled* in light theme — they pass AA on text contrast (the probe did not flag them), so this is visual weight, not a violation, but three independent sightings suggests the light secondary fill/border pair is tuned too faint against `--surface-panel`.
- Document type: implementation spec
- Branch: `design/improvements`
- Source design docs: `docs/redesign/kv-redesign-system-design.html` (tokens), `docs/redesign/kv-redesign-platform.html` (14 reference screens)
- Supersedes the visual layer of the prior "Aeon Ethereal" redesign (`spec/stitch-ui-implementation-plan.md`, `spec/ui/00-06`), which stays as historical record. Component architecture (atoms/molecules/organisms/templates) from that effort is kept, not rebuilt.

## Objective
Replace the current "Aeon Ethereal" glass visual system in `apps/web` with "Aurora Solid": opaque layered surfaces, no `blur()`/`backdrop-filter`, one shadow per frame, Sora + IBM Plex Mono typography. This is a full redesign, not a retint — where a mock screen's layout (grid structure, chrome bar, rail, split panels, steppers, KPI cells, etc.) differs from what exists today, rebuild the layout to match, not just the colors. Apply it to every existing screen, and add a first-run onboarding wizard that does not exist today. Bank reconciliation and Reports & JPK export are documented as backlog, not built in this plan (see Backlog).

## Product Decisions
Confirmed with the user before drafting this plan:
1. **Scope**: reskin all existing screens to Aurora Solid + build the onboarding wizard. Bank reconciliation and Reports & JPK export are backlog epics only (rough scope below), not implemented here.
2. **Theme mode**: keep the light/dark toggle. Aurora Solid becomes the new **dark** theme; a parallel **light** theme must be designed under the same structural rules (opaque surface steps, tinted status fills, no blur) — the source mock is dark-only, so the light theme has no reference and must be designed, not extracted.
3. **Layout**: token/color changes alone are not the ceiling. Where the mock's structure differs from the current screen (spacing rhythm, grid columns, panel splits, chrome bar/rail sizing, new elements like the KPI cell grid or clearance stepper), rewrite the layout to match the mock — full rebuild, not a patch.
4. **Recent invoice-workspace commits**: dropped as a constraint. `b106c97`, `2df05bf`, `93ae35d`, `83bdd56`, `d214302` targeted the old design/layout and do not need to be preserved or diffed against. Phase 2 rebuilds these screens clean from the mock. Any real data-correctness behavior worth keeping (e.g. comma-decimal input handling) gets re-verified and re-implemented fresh as part of the rebuild if it's still a live concern with the new UI, not carried forward as inherited code.

## Confirmed Findings
1. Stack: Next.js 15 (App Router) + Tailwind v4, tokens as CSS custom properties in `apps/web/src/app/globals.css` under `:root`/`html[data-theme='light']` and `html[data-theme='dark']`, re-exposed via `@theme inline`. Fonts are Inter + Manrope via `next/font/google`.
2. Components follow atomic structure: `src/components/{atoms,molecules,organisms,templates}`. Reused where their shape already matches the mock; retokenized where only color/spacing changed; restructured or replaced where the mock's layout genuinely differs (e.g. new organisms for the KPI cell grid, clearance stepper, split list+detail panel).
3. Current `--shadow-aura`, `ThemeSwitcher`, and card surfaces use soft shadows/gradients consistent with a "glass" direction — needs an audit for `blur(`/`backdrop-filter` usage before Phase 1 (none found in `globals.css` directly; component-level usage must still be checked, see Phase 1).
4. Screen → route mapping from the 14 mock screens:

   | # | Mock screen | Existing route | Notes |
   |---|---|---|---|
   | 01 | Sign in | `/login` | exists |
   | 02 | Onboarding | *none* | **new**, see Phase 4 |
   | 03 | Overview | `/dashboard` | exists |
   | 04 | Outgoing invoices | `/dashboard/invoices` | exists |
   | 05 | New invoice | `/dashboard/invoices/new` | exists |
   | 06 | Invoice detail | `/dashboard/invoices/[id]` (+`/edit`) | exists; full rebuild, recent rework not a constraint, see Product Decisions #4 |
   | 07 | Incoming | `/dashboard/incoming` | exists — simple 226px rail + 1fr table list, correction from an earlier pass of this table: not the same layout as 08 |
   | 08 | OCR inbox | `/dashboard/incoming/[id]` | exists — this is the review page, not a new route (API has no separate OCR queue, OCR is a status on `IncomingInvoice`). But it's a genuine 3-column split (`226px 300px 1fr`: rail + narrow upload queue + wide extract/confirm detail) — **inverse order** from the 09/13 split (`226px 1fr 372px`: rail + wide list + narrow detail). A third one-off shape, not a shared component with those two. |
   | 09 | Contractors | `/dashboard/contractors` (+`new`/`[id]/edit`) | exists |
   | 10 | Reports & JPK | *none* | **backlog** — API only has `GET /companies/:id/reports/vat-register`, no web page, no JPK export endpoint |
   | 11 | Bank reconciliation | *none* | **backlog** — no backend at all |
   | 12 | Settings | `/dashboard/settings` (tabs: company, KSeF, numbering, members, backup policy) | exists |
   | 13 | Products & services | `/dashboard/settings/service-catalog` | exists, needs a structural change (split list+detail panel), not just a token swap |
   | 14 | Mobile | *n/a* | folded into each screen's reskin acceptance criteria (existing app already has a floating mobile dashboard nav); not a separate epic |

5. Onboarding wizard steps map onto **existing** API endpoints — no new backend domain required:
   - Company data: `GET /companies/lookup` (NIP registry), `POST /companies` (create)
   - KSeF connection: `PUT /companies/:id/ksef-settings`
   - Invite accountant: `POST /companies/:companyId/members`
   - Open question for Phase 4 kickoff: does "Save and finish later" (shown in the mock) need server-persisted partial progress, or is client-side step state enough given each step only commits on its own submit? Resolve with backend-architect before building — do not assume a new "onboarding progress" model is needed.

## Architecture Decision — token migration strategy
- Keep the existing CSS variable **names** in `globals.css` (`--surface`, `--surface-muted`, `--surface-panel`, `--surface-raised`, `--foreground`, `--muted`, `--primary`, `--primary-strong`, `--primary-soft`, `--success`, `--warning`, `--error`, etc.) and repoint their **values** to Aurora Solid hex values for `dark`, and to the newly designed palette for `light`. This avoids touching every component's className.
- Add tokens that don't exist yet: a `--canvas` (page gradient background, distinct from `--surface`) and a `--chrome` (60px top bar / 226px rail background) surface step, a neutral/`offline24` status color (`#B6BCE0` dark equivalent), and a `--font-mono` var for IBM Plex Mono alongside `--font-sans` (Sora replaces Inter/Manrope for interface text).
- Radius scale changes from the current `--radius-md`/`--radius-lg`/`--radius-xl` (6px/24px/32px) to the mock's 5-step scale (6 chip / 9 control / 12 inset / 16 card / 20 frame) — needs new `--radius-chip`/`--radius-control`/`--radius-inset`/`--radius-card`/`--radius-frame` tokens (not `--radius-sm` — that name collides with Tailwind v4's default `rounded-sm` utility and would reintroduce a silent-override bug). `grep` shows zero direct `var(--radius…)` consumers outside `globals.css` — only Tailwind utilities (`rounded-lg`/`rounded-xl`, 10 sites total) use the old tokens today, so deleting them without a compatibility alias is safe as long as those 10 sites are swept explicitly (Tailwind's own default `rounded-lg`/`rounded-xl` values would otherwise silently apply instead of failing the build).
- Shadow: collapse to one token, applied only to the outer page frame, never to cards/rows/chips (matches current single `--shadow-soft`/`--shadow-aura` count, just retuned to the mock's `0 30px 90px rgba(0,0,0,0.6)` value on dark).
- Status colors keep their existing semantic slots (`success`/`warning`/`error`) and gain a fourth neutral slot for `offline24`/draft-style chips that isn't just `muted` text.

## Scope
In scope:
- Phase 0 design tokens (dark from mock, light designed to match) and font swap
- Phase 1 shared component/shell retokenization
- Phase 2–3 redesign (visual + layout, per screen as needed) of all 12 existing screens listed above
- Phase 4 onboarding wizard (new, frontend-only against existing endpoints, unless Phase 4 kickoff finds otherwise)
- Phase 5 accessibility/regression pass and doc updates

Out of scope (see Backlog):
- Bank reconciliation screen/domain
- Reports & JPK web page and JPK_V7M export generation
- Any new backend domain beyond what onboarding needs (expected: none)

## Phases

### Phase 0 — Design tokens & foundation
- Owner: **ux-ui-architect** (token spec + light-theme derivation), reviewed by **frontend-architect** (feasibility of the variable-name-stable migration above)
- Tasks:
  1. Extract the full Aurora Solid token set from `kv-redesign-system-design.html` (surfaces, accent/state colors, type scale, spacing, radius, shadow, component states) into a mapping onto the existing `globals.css` variable names, plus the new tokens listed under Architecture Decision.
  2. Design the parallel light theme under the same structural rules (opaque surface steps, 14–16% tinted fills for state colors, single shadow), using the current light theme's surface list as the starting point rather than from scratch.
  3. Confirm font swap: Sora (300/400/500/600/700) for interface text, IBM Plex Mono (400/500/600) for identifiers/labels/mono data — replacing Inter/Manrope in `next/font/google`.
  4. Audit every component under `src/components` for `blur(`/`backdrop-filter`/multiple shadows and list what must change in Phase 1 (`ThemeSwitcher` is the most likely offender — verify).
- Deliverable: **`docs/specs/aurora-solid-tokens.md`** — both themes, font swap plan, frame constants, migration map, contrast findings, component impact list.
- Verification: WCAG AA contrast check on text/interactive elements for both themes; sign-off before Phase 1 starts.
- Result: 9 AA failures found and resolved (see §7 of the token doc). Five carry over as sign-off items (§9): the light theme has no source mock, `--border-control` is a new token invented to fix a 1.4.11 failure in the mock's field styling, dark muted text moves from the mock's `ink 0.45` to `ink 0.60`, status fills are opaque hexes rather than the mock's `rgba()` tints, and ~60 status call sites need their `/NN` opacity modifiers stripped by hand. 24 `backdrop-blur` sites across 18 files, 7 stray shadows in 5 files, and 14 further translucent-fill files are listed for Phase 1; `ThemeSwitcher` is clean on blur/shadow (only needs a radius/surface token swap).
- Review: frontend-architect feasibility review returned conditional GO. Blockers B1 (status fill-vs-text token ambiguity, ~110 call sites) and B2 (`--error-action-ink` orphaned deletion) fixed in the token doc; B3 count corrections applied; light `--foreground-disabled` raised to `ink 0.55` (3.85:1) for legibility parity with dark. Architect addendum §A1–A3 (theme-inline mapping, gradient-token handling, radius sweep) appended to the same doc.

### Phase 1 — Shared components & shell
- Owner: **frontend-architect** (plans the change set), **frontend-engineer** (implements)
- Execution plan: `spec/aurora-solid-phase-1-change-set.md` — 6 commits (C1–C6, not 5; the Surface rebuild split out from the retone step as its own review unit). C2–C5 ship as one PR (token repoint, status-token + modifier strip, Surface/Banner extraction, atoms/molecules/organisms retoning) since the app is visibly broken mid-sequence; C1 (font swap) and C6 (`apps/e2e` update) ship independently.
- Commit order (per frontend-architect addendum A6): (1) font swap alone, (2) unblocked token repoints per the `@theme inline` mapping — everything except status tokens, (3) status tokens as one coupled commit with the ~60 call sites that currently apply `/25`, `/14`, etc. opacity modifiers to `bg-success`/`bg-warning`/`bg-error`/`border-*` — the new fills are pre-composited opaque hexes, so those modifiers must come off in the same commit or every status chip/banner renders at quarter strength, (4) component retoning (Surface rebuild, atoms, molecules, organisms), (5) `apps/e2e` assertion updates.
- Tasks: update `globals.css` tokens per Phase 0 spec (incl. the `@theme inline` mapping and gradient-token consumption addendum from the frontend-architect review — note `--surface` and `--surface-muted` change *meaning*, not just value: `--surface` shifts from page-ground to card-plane in dark, `--surface-muted` narrows from "generic elevated step" to "table header specifically", 7 and 4 call sites respectively need a look, not a blind repoint) for both `data-theme` blocks; land the font swap (Sora + IBM Plex Mono) in its own commit ahead of the token swap, isolated from the ~200 color-token changes; retokenize atoms (`Button`, `Badge`, `Input`, `Select`, `FloatingLabelInput`/`FloatingLabelSelect`, `Textarea`); rebuild `Surface` and its ~65 call sites across 20 files (retone to `canvas`/`chrome`/`panel`/`inset`, drop the `glass` tone — confirmed no functional blur/transparency dependency, only visual — and route the status-banner call sites that currently abuse `tone="glass"` + className overrides to a dedicated Banner/Alert component instead); retokenize molecules (`StatusChip`, `MetricCard`, `PageHeader`, `FormField`, `EmptyState`, `ErrorState`, `VatBreakdownTable`); rebuild organisms (`AppHeader` to the 60px chrome bar, `DashboardNavigation` to the 226px rail with gradient active-pill, `DashboardShell` surface steps, `ThemeSwitcher` — confirmed no blur/shadow issue, just needs `rounded-full` → `--radius-control` and `bg-surface-panel` → `--chrome`, `KsefEnvironmentSwitcher`/`CompanySwitcher` chip styling per mock's TEST/PROD dot chips); sweep the 10 `rounded-lg`/`rounded-xl` call sites onto the new radius tokens explicitly (see Architecture Decision); update `apps/e2e/tests/dashboard.spec.ts`'s 17 hardcoded atom-classname contrast assertions to match the new classes — and while touching it, switch those assertions to read computed styles off rendered atoms instead of literal className strings, so Phases 2–5 don't keep re-breaking it.
- Verification: `pnpm --filter @ksiegowy/web typecheck`, `pnpm --filter @ksiegowy/web build`, `pnpm --filter @ksiegowy/e2e test`, `grep -rn "blur(\|backdrop-filter" apps/web/src` returns nothing, visual smoke check on `/dashboard` in both themes.

### Phase 2 — Redesign batch A: auth, overview, outgoing invoices
- Owner: **frontend-engineer**, spot-reviewed by **ux-ui-architect**
- Routes: `/login`, `/dashboard`, `/dashboard/invoices`, `/dashboard/invoices/new`, `/dashboard/invoices/[id]`, `/dashboard/invoices/[id]/edit`
- Full rebuild in scope wherever the mock differs (e.g. Overview's KPI cell grid, monthly chart, and "Needs you today" alert list are new structure, not a retint). The invoice workspace's recent rework on this branch targeted the old design and is not a constraint here — build clean from the mock; re-verify data-correctness behavior (comma-decimal handling, pagination, line-item editor) still holds under the new UI, don't assume it carries over untouched.
- New pieces likely needed: a monthly bar-chart molecule and a "Needs you today" alert-list molecule for the Overview screen — check `src/components/molecules` first, only add if genuinely missing.
- Verification: same as Phase 1, plus any existing Playwright specs in `apps/e2e` for these routes still pass.

### Phase 3 — Redesign batch B: incoming/OCR, contractors, settings, service catalog
- Owner: **frontend-engineer**
- Routes: `/dashboard/incoming` (+`[id]`), `/dashboard/contractors` (+`new`/`[id]/edit`), `/dashboard/settings` (all tabs), `/dashboard/settings/service-catalog`
- Layout rewrite in scope per screen. `service-catalog` and `contractors` both need the mock's `226px 1fr 372px` split list+detail panel (screens 13 and 09) — frontend-architect's call: build both **inline** in their own page components, not a shared organism. The shell (`DashboardShell`) is a server component with the rail baked in above `main`; the detail panel is a third column that has to live inside `main` next to the list, driven by client-side selection state — hoisting that into the shell or a generic `SplitPanelWorkspace` costs more than the ~2x duplication it would save, and a config-flag component handling three different data shapes is unreadable. Build both, and only extract a shared component afterward if the two implementations end up identical — cheap direction to be wrong in. Known deviation to flag to ux-ui-architect: the detail panel sits inset by `main`'s 26px padding rather than flush to the frame edge like the mock; `service-catalog/page.tsx`'s `xl:max-w-3xl` wrapper needs to go so the split can use full main width.
- `/dashboard/incoming/[id]` (OCR review, screen 08) is its own third split shape (`226px 300px 1fr`, narrow list before wide detail — inverse order from 09/13) — also inline, not shared with the other two.
- Verification: same as Phase 1/2.

### Phase 4 — Onboarding wizard
- Owner: **frontend-architect** (flow/state design), **frontend-engineer** (implementation); **backend-architect** consulted once on the partial-save question above
- Steps: Account (already satisfied by existing auth) → Company data (NIP lookup + confirm/edit → `POST /companies`) → KSeF connection (`PUT /companies/:id/ksef-settings`) → Invite accountant (optional, `POST /companies/:companyId/members`)
- Decide entry point: redirect from `/login` when the signed-in user has no company, replacing today's inline "no company" `EmptyState` on `/dashboard`.
- Verification: **e2e-test-engineer** adds a Playwright flow covering first-run sign-in through wizard completion.

### Phase 5 — Accessibility, regression, and docs
- Owner: **frontend-architect** or **principal-engineer** review; **e2e-test-engineer** for the suite run
- Tasks: full contrast/accessibility re-check both themes across all reskinned routes; remove dead Aeon Ethereal leftovers (unused shadow/blur utilities); mark `spec/stitch-ui-implementation-plan.md` and `spec/ui/00-06` as superseded by this plan; update this plan's Status per phase as work lands; update `README.md`/`docs/architecture.md` if navigation structure changed.
- Verification: `pnpm --filter @ksiegowy/web typecheck`, `pnpm --filter @ksiegowy/web build`, `pnpm build` for the monorepo, full `apps/e2e` Playwright run.

## Backlog (out of scope for this plan)
- **Bank reconciliation** (mock screen 11): no backend exists. Needs a domain design pass (statement import format, matching rules, ledger linkage) from **backend-architect** before any UI work.
- **Reports & JPK export** (mock screen 10): `GET /companies/:id/reports/vat-register` exists but has no web page; JPK_V7M XML generation/export is net-new and compliance-sensitive — needs **backend-architect** for the export pipeline and a **tax-advisor** consult on required fields/format before scoping.
- **Payment status on the invoices list** (found in Phase 2): `GET /companies/:id/invoices` doesn't select `paymentReceived`/`paymentDueDate` (only the single-invoice detail endpoint does), so the Payment column and Overview's attention list can't show true paid/unpaid/overdue. User decision: backlog, not built in this plan. Small **backend-engineer** task when picked up — add the two fields to the list query/serializer.
- **Bulk invoice actions + search/saved-views** (found in Phase 2): mock's row-selection bulk bar (Send to KSeF / Download PDFs / Register payment / Delete drafts) and free-text search/date-range/saved-views on the outgoing-invoices list have no backend today. User decision: backlog epic, not dropped from design intent. Needs **backend-architect** for bulk-operation endpoints and search/filter query params before UI work.
- **Aggregation/schema gaps found in Phase 3** (batch B), same treatment as the two Phase 2 items above — backlog, not built here, needs **backend-architect** scoping (mostly new Prisma columns + aggregate endpoints, bigger than a two-field serializer fix):
  - Incoming: auto-fetch schedule config, OCR-suggested category concept, VAT/category KPI aggregation ("Booked this month" / "Input VAT sum" / "Due this week")
  - Contractors: turnover, outstanding balance, payment-terms, average-days-to-pay, and a `contractorId` filter on the outgoing-invoices list endpoint to compute any of it
  - Service catalog: internal code, net price on `ServiceTemplate`, GTU code, per-item usage-count aggregation, and a type field to filter Services/Products
  - Settings: Notifications and API & webhooks sections have no backend (also outside every phase's task scope so far)
- **Logo has no light-theme variant** (found in Phase 5): `components/brand/assets/logo.png` is a single asset, `BrandImage.tsx` has no theme conditional — the wordmark is near-invisible on the light chrome bar, on every screen. Pre-existing, more visible now the chrome bar went from dark to `#F4F6FC`. Needs a **ux-ui-architect**-produced light variant (or a themed SVG wordmark) before a **frontend-engineer** wires it up.
- **Secondary/outline buttons read faint in light theme** (found in Phase 5): passes AA text contrast, not a violation, but three independent sightings (onboarding step 2's primary affordance, service-catalog, invoice detail) suggest the light secondary fill/border pair is under-weighted against `--surface-panel`. Needs a **ux-ui-architect** tuning pass on those two token values.
- **Invite accept page missing** (found in Phase 4, pre-existing, not caused by this redesign): the invite link `/invite/{token}` generated by `POST /companies/:companyId/invites` (used by both the existing Members settings tab and the new onboarding step 4) has no corresponding frontend accept page anywhere in `apps/web/src/app`. Onboarding now surfaces this link as a first-run path, making the gap more visible. Needs a **frontend-engineer** task (small — one page hitting `POST /invites/:token/accept`) whenever picked up; not blocking Phase 4 since building it wasn't in that phase's scope.

## Risks
- Recent commits on `design/improvements` (`b106c97`, `2df05bf`, `93ae35d`, `83bdd56`, `d214302`) targeted the old design and are dropped as a constraint (see Product Decisions #4). Watch only for regressing correctness behavior that has nothing to do with layout (e.g. comma-decimal parsing bugs) if it resurfaces during the rebuild — re-verify, don't assume.
- The light theme has no source mock; it's original design work and the main open-ended risk in Phase 0. Needs explicit sign-off before Phase 1 consumes it.
- Font swap (Sora/IBM Plex Mono) touches every screen at once; `next/font/google` self-hosts at build time so it doesn't add a runtime dependency for the self-hosted deployment target, but weights/subsets must be set deliberately to avoid FOUT/CLS regressions.
- Onboarding wizard changes the first-run path — confirm it doesn't collide with the existing invite-token accept flow (`POST /invites/:token` in `members.ts`), which is a different (invited-user) entry point.

## Delegation Map
| Phase | Specialist(s) |
|---|---|
| 0 | ux-ui-architect → frontend-architect review |
| 1 | frontend-architect → frontend-engineer |
| 2 | frontend-engineer → ux-ui-architect spot review |
| 3 | frontend-engineer (+ frontend-architect nod on service-catalog) |
| 4 | frontend-architect + backend-architect (consult) → frontend-engineer → e2e-test-engineer |
| 5 | frontend-architect/principal-engineer review → e2e-test-engineer |

## Next Step
This document is a plan only — no implementation has started. On approval, kick off Phase 0 by delegating to **ux-ui-architect** for the token spec and light-theme derivation.

---

## Phase 4 — Onboarding Wizard Design

Owner: **frontend-architect** (this section) → **frontend-engineer** (implements) → **e2e-test-engineer** (flow coverage).
Reference: mock screen 02 (`docs/redesign/kv-redesign-platform.html`, `===================== 02`).

The wizard is the only genuinely new feature in this plan. The design below deliberately adds **no new backend, no state library, no wizard orchestrator component** — the router and the existing forms already do the work.

### 1. Route structure and entry point

**`/onboarding` is a top-level route, not nested under `/dashboard`.**

`app/dashboard/layout.tsx` renders `DashboardShell` — the 226px nav rail, the chrome bar, the JPK deadline widget. Mock screen 02 has none of that: it has its own 60px chrome bar (logo, "Setting up <company>", "Save and finish later") and a **300px step rail** where the nav rail would be. Nesting under `/dashboard` means fighting the shell on every screen. A sibling route gets the mock's layout for free.

```
app/onboarding/layout.tsx     chrome bar + 300px step rail + 300px/1fr grid
app/onboarding/page.tsx       redirect() to the first incomplete step
app/onboarding/company/page.tsx
app/onboarding/ksef/page.tsx
app/onboarding/team/page.tsx
```

Steps are **path segments, not a `?step=2` query param**. Back/forward, refresh, and deep links all work with no code, and each step page is a server component that loads exactly what that step needs.

**Entry point.** `app/dashboard/page.tsx`'s `if (!companyId)` branch — currently a `PageHeader` + `EmptyState` pointing at settings — is deleted and becomes:

```ts
if (!companyId) redirect('/onboarding');
```

**Keep the redirect on `dashboard/page.tsx` only. Do not move it to `dashboard/layout.tsx` or middleware.** A layout-level redirect fires for `/dashboard/settings` too, and settings is exactly where an existing user creates an *additional* company — they would get bounced into onboarding every time. Other dashboard routes keep whatever no-company handling they already have (e.g. `service-catalog/page.tsx` has its own `EmptyState`); tightening those is not Phase 4's job.

**Reverse guard.** `app/onboarding/layout.tsx` calls `requireAuthSession('/onboarding')` and redirects a user who has already finished (company + KSeF credential) to `/dashboard`. Without it, a completed user can wander back into the wizard.

**Invite-flow collision — check this before shipping.** The existing invited-user entry point is `POST /invites/:token/accept` (`apps/api/src/routes/members.ts:214`). An invited accountant has **zero companies until they accept**, so any redirect that catches "signed in with no company" would also catch them and push them into creating their own company — wrong. The design avoids this because the redirect lives only on `/dashboard/page.tsx` and the accept route is its own path; the constraint to verify is that **the invite link must not route through `/dashboard`**. e2e should cover it.

### 2. Step state management

**URL-driven. No client wizard state, no context provider, no reducer, no `localStorage`.**

There is no cross-step client state to manage, because each step commits on its own submit and nothing needs to be held between them:

| Step | Commits via | After it succeeds |
|---|---|---|
| 1 Account | already satisfied by existing auth | — |
| 2 Company data | `lookupCompanyByNip` → `createCompany` (`POST /companies`) | the company row exists → **session refresh, see below** |
| 3 KSeF connection | `updateCompanyKsefCredential` (**PATCH** `/companies/:id/ksef-settings`) | a credential with `hasToken: true` exists |
| 4 Invite accountant | `createInvite` (`POST /companies/:companyId/invites`) — optional | an invite token exists |

Within a step, form state is local `useState` — which is already how `CompanyDetailsForm` and `KsefSettingsForm` work today. Between steps, state is the database.

#### Required transition between steps 2 and 3 — session re-mint

Caught by **backend-architect**: every company-scoped route authorizes off the JWT's `companies` claim, **not** the database, and `POST /companies` does not re-mint the auth cookie. Immediately after step 2 succeeds the browser's token still says `companies: []`, so step 3's `PATCH /companies/:id/ksef-settings` and step 4's invite call both **403**.

The wizard must refresh the session between step 2 and step 3. This is a hard requirement of the flow, not a nicety — and it is **already implemented in the component being reused**: `app/dashboard/settings/CompanyDetailsForm.tsx:83` calls `await refreshBrowserSession('/dashboard')` immediately after `createCompany` in create mode. `refreshBrowserSession` (`lib/api-client.ts:111`) does a full-page `window.location.assign('/api/session/refresh?next=…')`, which re-mints the cookie server-side and lands on `next`.

So the entire fix is making that hardcoded `'/dashboard'` configurable — see §4. Note it must stay a **full-page navigation**, not a `router.push`, because the new cookie has to be read server-side on the next request.

**Refresh survival is therefore free** and needs no mechanism: a refresh re-runs the server component, which re-derives the current step from the session and the company. The only thing lost on refresh is text the user typed and did not submit, which is the same behaviour as every other form in the app.

### 3. "Save and finish later" — resolution

**It is a link to `/dashboard`. Not a save action, and it needs no server-persisted partial progress or new backend model.**

The reasoning is that step 2 is the only irreversible commit, and once it lands **the company row *is* the persisted progress**. Steps 3 and 4 mutate that same company. So resume state is derivable from data that already exists:

```
/auth/me → companies: []                          → /onboarding/company
company, no credential with hasToken: true        → /onboarding/ksef
otherwise                                         → done
```

`GET /companies/:id/ksef-settings` already returns `credentials: CompanyKsefCredentialStatus[]`, and that type carries `hasToken: boolean` (`api-types.ts:180`) — so the predicate is "no credential with `hasToken: true`", readable with one call the step page needs to make anyway. Note this is stricter than "`credentials` is non-empty": a credential row can exist without a token.

**Step 4 is not detectable and does not need to be.** It is optional and skippable, so there is no "incomplete step 4" state to resume into — a user who reaches step 3's completion is done.

Before step 2 commits there is nothing worth persisting except unsubmitted form text, and `GET /companies/lookup` is cheap and idempotent — re-running the NIP lookup on return is simpler and fresher than storing a draft. An "onboarding progress" table would exist only to duplicate what the company row already tells us.

**Confirmed by backend-architect** (cross-checked per the plan's Phase 4 note): no new backend work, no schema change, no partial-progress model. They add that a user who abandons after step 2 leaves a fully valid Company + membership — a legitimate steady state, indistinguishable from someone who deliberately skipped KSeF, and not an error to recover from.

### 4. Component boundaries

Reuse verdicts, ladder applied — two of the three forms already exist and fit.

| Piece | Verdict |
|---|---|
| **`CompanyDetailsForm`** (`app/dashboard/settings/`, 205 lines) | **Reuse as-is.** It already takes `company: Company \| null`, branches on `isCreateMode`, does the NIP lookup via `lookupCompanyByNip`, calls `createCompany` on submit, **and already calls `refreshBrowserSession('/dashboard')` at line 83** — i.e. the step 2→3 session re-mint is already written. The entire change is making that target configurable: add an optional `redirectTo?: string` (default `'/dashboard'`) and pass it to `refreshBrowserSession`. Do not fork the component. |
| **`KsefSettingsForm`** (171 lines) | **Reuse.** Props are already `{ companyId, settings }`, exactly what step 3 has. Same optional `redirectTo` prop for "Continue". |
| **`MembersTab`** (254 lines) | **Do not reuse.** It is a members list + role editing + invite management surface. Step 4 needs one email field and a submit. Call `createInvite` from `lib/api-client` directly in a small step component; dragging the management UI into onboarding would be more work than the ~30 lines it replaces. |
| **`Banner`** (built in Phase 1) | Reuse for the mock's `MATCHED` confirmation and the amber "must be able to receive KSeF invoices" note. |
| **`Button` / `Input` / `Select` / `FormField` / `Surface`** | Reuse. All retokenized in Phase 1. |

**New pieces — three files plus three thin pages:**

1. `app/onboarding/layout.tsx` — chrome bar (logo, "Setting up <name>", "Save and finish later" → `/dashboard`), the `300px 1fr` grid, `requireAuthSession`, and the completed-user guard.
2. `components/organisms/OnboardingStepRail.tsx` — the four step cards (done / active / pending states per mock, using `--nav-active` for active and the success tint for done) plus the amber note pinned to the bottom. Takes `currentStep` and a `completed` set; renders no logic of its own.
3. `app/onboarding/{company,ksef,team}/page.tsx` — server components that load their data, render the reused form, and pass `redirectTo` for the next step.

**No `OnboardingWizard` orchestrator component.** The App Router is the orchestrator; a wrapper would only re-implement navigation that `redirect()` already does.

### 5. Step-specific behaviour frontend-engineer must handle

Three API realities that change the UI, not just the wiring. Two were caught by **backend-architect**.

**Step 2 — duplicate NIP returns 409.** `POST /companies` rejects a NIP that already exists anywhere in the system. For a *returning* user, drive the step off `/auth/me` first (per §3) rather than blind-reposting a company they already created. When a genuine 409 does surface, word it as **"someone already registered this NIP"** — not "you already have this company", which is both wrong and confusing, since the conflicting record may belong to another account entirely. Render it through `Banner tone="error"`.

**Step 4 — no email is sent.** `POST /companies/:companyId/invites` returns `{ id, email, role, token, expiresAt }` and **there is no mail implementation anywhere in `apps/api`**. The mock's "invite your accountant" copy implies an email goes out; it does not. Step 4's success state must surface a **copyable invite link** built from the returned `token`, with the expiry shown. An invite the user cannot see or send is a dead end.

**Step 4 — send `role` explicitly.** `createInvite`'s `role` is optional and the endpoint defaults to `VIEWER`. An accountant needs `role: 'ACCOUNTANT'`. Pass it explicitly rather than relying on the default.

### 6. Corrections to Confirmed Findings #5 and Risks

Found while reading the API; worth fixing in this document independently of Phase 4:

- **KSeF settings is `PATCH`, not `PUT`** — `apps/api/src/routes/companies.ts:549`. Finding #5 says `PUT`.
- **Invite creation is `POST /companies/:companyId/invites`, not `.../members`** — `apps/api/src/routes/members.ts:165`. The `.../members` POST route does not exist; `members.ts` has only GET/PATCH/DELETE there. Finding #5 names the wrong path.
- **Invite accept is `POST /invites/:token/accept`, not `POST /invites/:token`** — `members.ts:214`. Both Finding #5's neighbouring note and the Risks bullet drop the `/accept`.

### 7. Scope note — invoice numbering

Mock screen 02's step 2 includes an "Invoice numbering" block (pattern / reset / next number). **Leave it out of the wizard.** `invoiceNumberPattern` already has a sensible default and a dedicated editor at `app/dashboard/settings/InvoiceNumberPatternForm.tsx`; putting it in step 2 means either extending `POST /companies` to accept it or firing a second PATCH mid-wizard, for a setting most first-run users will not change. If the user wants it in, it is an additive change to step 2 later — flagging rather than silently dropping it.

### 8. Verification

- **e2e-test-engineer**: Playwright flow covering first-run sign-in → company (NIP lookup + create) → KSeF → skip invite → land on `/dashboard`.
- Guard cases that must be covered, because each one is a silent failure rather than a visible bug:
  1. **Step 3 does not 403.** The session re-mint between steps 2 and 3 is the single most likely thing to regress — if `redirectTo` is dropped or turned into a `router.push`, the wizard breaks exactly here and only for genuinely new users, so it will not show up in manual testing on a seeded account.
  2. A completed user hitting `/onboarding` is bounced to `/dashboard`.
  3. An invited user with zero companies reaches the invite-accept flow **without** being captured by the onboarding redirect.
  4. Step 4 renders a copyable invite link (no email is sent — §5).
- `pnpm --filter @ksiegowy/web typecheck && build`.
- Both themes checked on the new screens — the wizard is the first surface built after the Phase 1 token work with no Phase 2/3 precedent to inherit from.

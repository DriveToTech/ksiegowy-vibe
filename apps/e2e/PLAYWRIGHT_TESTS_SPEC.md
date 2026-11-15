# Playwright E2E Tests — Specification

## Overview

This specification documents the current mock-backed Playwright suite for authentication, onboarding, navigation, contractors, invoices, incoming invoices, mobile remediation, and visual dashboard baselines. It does not require a live API, PostgreSQL database, or live KSeF.

## Authentication Strategy

The middleware (`apps/web/src/middleware.ts`) protects `/dashboard/*` by checking an `auth_token` cookie. Since Google OAuth cannot be automated in E2E, tests bypass auth by injecting deterministic fixture cookies via a shared Playwright fixture and the mock API supplies the corresponding session.

- The authenticated fixture uses `test-token`; no JWT signing or database is required.
- The onboarding fixture uses a unique deterministic token so mutable mock-company state cannot collide between tests.

## File Structure

```
apps/e2e/tests/
  smoke.spec.ts              ← existing (home + login page loads)
  fixtures/
    auth.ts                  ← shared auth fixture (inject deterministic auth cookie)
  dashboard.spec.ts          ← dashboard overview tests
  contractors.spec.ts        ← contractor list and form tests
  invoices.spec.ts           ← invoice list and form tests
  incoming.spec.ts           ← incoming invoice actions and KSeF import modal
  mobile-regression.spec.ts  ← mobile width/theme, shell, route, and safety checks
  navigation.spec.ts         ← sidebar navigation tests
  onboarding.spec.ts         ← first-run company, KSeF, and team flow
```

## Current Runtime

Playwright starts both servers from `apps/e2e/playwright.config.ts`:

- Mock API: `http://localhost:3199`, from `mock-api/server.js`, with mutable synthetic fixture maps.
- Next.js web: `http://localhost:3200`, started with webpack because the current Next.js Turbopack dev server cannot resolve the app's `next/font/google` imports reliably in CI. Both `API_URL` and `NEXT_PUBLIC_API_URL` are set to `http://localhost:3199`.
- Server reuse: disabled for both servers, so a stale local process is not reused.
- Workers: exactly `1` in local and CI runs so mutation tests share one mock process deterministically.
- Retries: `0` locally and `2` in CI.


---

## Test Cases

### `fixtures/auth.ts`

- Export an extended `test` with an `authenticatedPage` fixture
- Fixture injects cookie `auth_token` via `page.context().addCookies()`
- Static test data — no DB required

---

### `dashboard.spec.ts`


| Test                                               | Setup                                   | Assertion                                                                                     |
| -------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------- |
| dashboard redirects unauthenticated users to login | no cookie, navigate to `/dashboard`     | URL becomes `/login`                                                                          |
| dashboard loads with the KSeF clearance KPI grid  | authenticated, navigate to `/dashboard` | heading "Panel operacyjny" and labels "Przyjęte", "W trakcie rozliczenia", "Odrzucone", "Nie wysłane" |
| dashboard exposes contextual destinations          | authenticated                           | links "Nowa faktura" and "Przejdź do OCR" visible; no persistent quick-action panel |
| dashboard redirects without a company             | authenticated, no active company        | URL becomes `/onboarding`; heading "Skonfiguruj firmę" visible                                  |


---

### `contractors.spec.ts`


| Test                                              | Setup                                               | Assertion                                                                                         |
| ------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| contractors list page loads                       | authenticated, navigate to `/dashboard/contractors` | heading "Kontrahenci", link "Dodaj po NIP" visible                                                   |
| contractors list shows search and filter controls | authenticated                                       | search input placeholder "Szukaj po nazwie lub NIP…", buttons "Wszyscy", "Aktywni", "Nieaktywni"  |
| contractors list shows mock contractor and filtered empty state | authenticated                           | "Bluebird Example Studio LLC" is visible; inactive filter shows "Brak wyników dla podanego filtra." |
| new contractor form loads                         | navigate to `/dashboard/contractors/new`            | heading "Nowy kontrahent", labels "Nazwa", "NIP", and "Email" visible                             |
| new contractor form has submit and cancel actions | navigate to `/dashboard/contractors/new`            | buttons "Dodaj kontrahenta" and "Anuluj" visible                                                   |
| new contractor form cancel returns to list        | click "Anuluj"                                      | URL becomes `/dashboard/contractors`                                                              |


---

### `invoices.spec.ts`


| Test                                            | Setup                                            | Assertion                                                                                    |
| ----------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| invoices list page loads                        | authenticated, navigate to `/dashboard/invoices` | heading "Faktury sprzedażowe" visible                                                        |
| invoices list shows status filter tabs          | authenticated                                     | links "Wszystkie" and "Szkice" visible; clicking "Szkice" adds `status=DRAFT`               |
| invoices list shows new invoice button          | authenticated                                    | link "Nowa faktura" visible                                                                  |
| new invoice form loads                          | navigate to `/dashboard/invoices/new`            | heading "Nowa faktura" visible                                                               |
| new invoice form has line item and payment sections | authenticated                                  | headings: "Pozycje faktury", "Daty i płatność", "Podsumowanie" visible                        |
| new invoice form has date, contractor, and bank fields | authenticated                               | inputs `issueDate`, `contractorId`, and `bankAccount` present                                 |
| new invoice form can add a line item            | click "+ Dodaj pozycję"                          | second "Nazwa pozycji" combobox appears                                                       |
| new invoice form can select a catalogue service | click "+ Dodaj pozycję", select service          | service value and unit are populated                                                          |
| new invoice form cancel returns to list         | click "Anuluj"                                   | URL becomes `/dashboard/invoices`                                                            |
| accepted invoice can create formal correction   | accepted invoice route, create formal correction | correction draft and `Wyślij korektę do KSeF` action are visible                              |


---

### `navigation.spec.ts`


| Test                                                   | Setup                                   | Assertion                                                                                           |
| ------------------------------------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| sidebar shows all navigation items                     | authenticated, navigate to `/dashboard` | links "Przegląd", "Doradca", "Faktury wychodzące", "Faktury przychodzące", "Kontrahenci", "Raporty & JPK", "Ustawienia" visible |
| clicking Kontrahenci navigates to contractors page     | click nav link "Kontrahenci"            | URL becomes `/dashboard/contractors`                                                                |
| clicking Faktury wychodzące navigates to invoices page | click nav link "Faktury wychodzące"     | URL becomes `/dashboard/invoices`                                                                   |
| clicking Ustawienia navigates to settings page         | click nav link "Ustawienia"             | URL becomes `/dashboard/settings`                                                                   |
| settings page loads with members section               | navigate to `/dashboard/settings`       | heading "Ustawienia", text "Członkowie" visible                                                     |


---

## Implementation Notes

- **Authentication**: Keep auth deterministic and mock-backed; do not add JWT dependencies for this suite.
- **Empty states are acceptable**: List pages will render empty — tests assert page structure, not data.
- **Out of scope**: Data-driven tests (actual contractor/invoice creation via form submit) require a live API + DB and belong in a future integration test phase.
- **Selector priority**: `getByRole` &gt; `getByLabel` &gt; `getByPlaceholder` &gt; `getByText`. Avoid CSS selectors.
- **Navigation selectors**: Scope dashboard sidebar navigation clicks to the `Nawigacja dashboardu` landmark so tests only target primary navigation links, not similarly named quick actions.
- **Test isolation**: Each test gets a fresh browser context; the single mock API process is intentionally shared, and onboarding uses a unique token because its company state is mutable.

## Running Tests

```bash
# Run all e2e tests
pnpm test:e2e

# Run a specific file
pnpm --filter @ksiegowy/e2e exec playwright test tests/contractors.spec.ts

# UI mode for debugging
pnpm --filter @ksiegowy/e2e test:ui

# View last report
pnpm --filter @ksiegowy/e2e report
```

## Visual Regression

Visual tests run only when `VISUAL_REGRESSION=true`, which enables the `chromium-linux` project in addition to the default project. Use the single documented command, which runs the pinned Playwright `1.59.1` container image (`mcr.microsoft.com/playwright:v1.59.1-noble`) with the repository bind-mounted:

```bash
pnpm --filter @ksiegowy/e2e visual                                              # verify all visual specs
pnpm --filter @ksiegowy/e2e visual -- --update tests/advisor-visual.spec.ts     # regenerate one spec
```

`apps/e2e/scripts/run-visual-regression.sh` runs three workers by default (`E2E_WORKERS` overrides it). In visual mode the web server is a production build (`next build` then `next start`, output in `apps/web/.next-visual`) instead of `next dev`, so no route is compiled during a test and the dev error badge never appears in screenshots. Linux `node_modules`, the pnpm store and the build live in named Docker volumes (`ksiegowy-visual-*`), so host macOS files are never overwritten and later runs skip the install. Remove them with `docker volume rm`, never `docker volume prune`. Timing for the full visual set (58 tests): about 8 minutes with the old rsync copy, reinstall and `next dev` flow; about 2 minutes now, stable across repeated runs with three workers.

The command covers the dashboard, invoice and advisor baselines. Do not compare snapshots with a floating Playwright version or a different container image. Dashboard, invoice and advisor visuals pin the browser clock to 2026-10-15 because the rail JPK countdown ("Termin za 10 dni") is computed from the current date; the server renders it with the real date, so wait for hydration before capturing. If the run logs `Failed to download Sora from Google Fonts`, fallback fonts make every snapshot fail: rerun. The recorded API verification result is 130 tests passing with a clean typecheck; this E2E setup uses synthetic data and does not claim live KSeF or applied database migrations.

### Advisor visuals

`tests/advisor-visual.spec.ts` holds the advisor visual set (dock, drawer and sheet shells, conversation and error states, answers, composer states, blockers, history and delete dialog, the full page, Explain, insight strip, Mode A settings). Shared mocks and capture helpers live in `tests/fixtures/advisor-visual.ts` and `tests/fixtures/advisor-visual.css`.

- Baselines are `tests/advisor-visual.spec.ts-snapshots/advisor-<name>-<theme>-<width>-chromium-linux.png` and exist only for the `chromium-linux` project; the default project skips every `visual:` test.
- Determinism: `page.clock.setFixedTime` pins the instant to 2026-10-15 (month 2026-10), locale `pl-PL`, timezone `Europe/Warsaw`, theme from `localStorage`, `animations: 'disabled'` plus `transition: none` and the hidden Next dev badge and pinned JPK progress fill through `stylePath`. All advisor API calls are `page.route` mocks.
- Panel and element captures are used except `page-empty-briefing`, which is a full page. The mobile sheet is capped at 760px by the product, so tall answers at 390 are captured as the sheet scrolls (bottom of the answer).
- Ports 3199 (mock API) and 3200 (web) must be free; the config never reuses a running server.

Run the verify command twice after updating: both runs must pass without diffs. `tests/fixtures/visual-stability.css` (applied to every capture through the config) pins the rail JPK progress fill to the value for the fixed test date, because the server renders it with the real date and hydration does not repair style attributes.


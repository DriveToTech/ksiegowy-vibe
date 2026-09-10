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
- Next.js web: `http://localhost:3200`, with both `API_URL` and `NEXT_PUBLIC_API_URL` set to `http://localhost:3199`.
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
| sidebar shows all navigation items                     | authenticated, navigate to `/dashboard` | links "Przegląd", "Faktury wychodzące", "Faktury przychodzące", "Kontrahenci", "Raporty & JPK", "Ustawienia" visible |
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

Visual tests run only when `VISUAL_REGRESSION=true`, which enables the `chromium-linux` project in addition to the default project. Use the pinned Playwright `1.59.1` dependency and matching container image:

```bash
docker run --rm --ipc=host --env CI=true -e VISUAL_REGRESSION=true -v "$PWD:/work" -w /work mcr.microsoft.com/playwright:v1.59.1-noble bash -lc "corepack enable && pnpm install --frozen-lockfile && pnpm --filter @ksiegowy/e2e exec playwright test tests/dashboard.spec.ts --project=chromium-linux --grep 'visual:' --update-snapshots"
docker run --rm --ipc=host --env CI=true -e VISUAL_REGRESSION=true -v "$PWD:/work" -w /work mcr.microsoft.com/playwright:v1.59.1-noble bash -lc "corepack enable && pnpm install --frozen-lockfile && pnpm --filter @ksiegowy/e2e exec playwright test tests/dashboard.spec.ts --project=chromium-linux --grep 'visual:'"
```

These commands update or verify the three dashboard baselines. Do not compare snapshots with a floating Playwright version or a different container image. The recorded API verification result is 130 tests passing with a clean typecheck; this E2E setup uses synthetic data and does not claim live KSeF or applied database migrations.

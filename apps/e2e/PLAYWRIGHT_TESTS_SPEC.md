# Playwright E2E Tests — Specification

## Overview

The app currently has 2 smoke tests covering the home and login pages only. This specification defines additional E2E tests for core dashboard features: authentication, navigation, contractors, and invoices.

## Authentication Strategy

The middleware (`apps/web/src/middleware.ts`) protects `/dashboard/*` by checking an `auth_token` JWT cookie. Since Google OAuth cannot be automated in E2E, tests bypass auth by injecting a pre-signed JWT cookie via a shared Playwright fixture.

- The fixture signs a JWT with `process.env.JWT_SECRET ?? 'test-secret'`
- The JWT payload must match the shape expected by `requireAuthSession()` in `apps/web/src/lib/auth.ts`
- JWT payload: `{ userId, email, companies: [{ id, name, role: 'ADMIN' }], activeCompanyId }`

## File Structure

```
apps/e2e/tests/
  smoke.spec.ts                            ← existing (home + login page loads)
  fixtures/
    auth.ts                                ← shared auth fixture (inject auth cookie)
  dashboard.spec.ts                        ← dashboard overview tests
  contractors.spec.ts                      ← contractor list and form tests
  invoices.spec.ts                         ← invoice list and form tests
  navigation.spec.ts                       ← sidebar navigation tests
  onboarding.spec.ts                       ← company onboarding wizard tests
  household-onboarding-entrypoint.spec.ts  ← company-vs-household entrypoint choice
  household-ledger.spec.ts                 ← household ledger/envelope/commitment journey
```

## Files to Create / Modify


| File                        | Action | Purpose                                    |
| --------------------------- | ------ | ------------------------------------------ |
| `tests/fixtures/auth.ts`    | Create | Playwright fixture injecting auth cookie   |
| `playwright.config.ts`      | Modify | Forward `JWT_SECRET` env var to web server |
| `tests/dashboard.spec.ts`   | Create | Dashboard overview                         |
| `tests/contractors.spec.ts` | Create | Contractor list, create form               |
| `tests/invoices.spec.ts`    | Create | Invoice list, new invoice form             |
| `tests/navigation.spec.ts`  | Create | Sidebar navigation and routing             |
| `mock-api/server.js`        | Modify | Household fixtures + route handlers (Phase 1 personal mode) |
| `tests/fixtures/auth.ts`    | Modify | Add static-household owner/member page fixtures |
| `tests/household-onboarding-entrypoint.spec.ts` | Create | Company-vs-household entrypoint choice |
| `tests/household-ledger.spec.ts` | Create | Household ledger/envelope/commitment journey |


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
| dashboard loads with all metric cards              | authenticated, navigate to `/dashboard` | headings: "Panel operacyjny", "Faktury w tym miesiącu", "Oczekuje na KSeF", "Łączna sprzedaż" |
| dashboard shows quick action links                 | authenticated                           | links: "Nowa faktura", "Prześlij fakturę przychodzącą", "Zarządzaj zespołem"                  |
| dashboard shows empty state without company        | authenticated, no active company        | text "Brak skonfigurowanej firmy", button "Przejdź do ustawień"                               |


---

### `contractors.spec.ts`


| Test                                              | Setup                                               | Assertion                                                                                         |
| ------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| contractors list page loads                       | authenticated, navigate to `/dashboard/contractors` | heading "Kontrahenci", button "Dodaj kontrahenta" visible                                         |
| contractors list shows search and filter controls | authenticated                                       | search input placeholder "Szukaj po nazwie lub NIP…", buttons "Wszyscy", "Aktywni", "Nieaktywni"  |
| contractors list shows empty state                | authenticated, no contractors in DB                 | empty state text visible                                                                          |
| new contractor form loads                         | navigate to `/dashboard/contractors/new`            | heading "Nowy kontrahent", fields `contractor-name`, `contractor-nip`, `contractor-email` visible |
| new contractor form validates required fields     | submit empty form                                   | validation error(s) visible                                                                       |
| new contractor form cancel returns to list        | click "Anuluj"                                      | URL becomes `/dashboard/contractors`                                                              |


---

### `invoices.spec.ts`


| Test                                            | Setup                                            | Assertion                                                                                    |
| ----------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| invoices list page loads                        | authenticated, navigate to `/dashboard/invoices` | heading "Faktury sprzedażowe", metric cards visible                                          |
| invoices list shows new invoice button          | authenticated                                    | link "Nowa faktura" visible                                                                  |
| new invoice form loads                          | navigate to `/dashboard/invoices/new`            | heading "Nowa faktura" visible                                                               |
| new invoice form has all required sections      | authenticated                                    | section headings: "Dane Dokumentu", "Pozycje faktury", "Szczegóły płatności", "Podsumowanie" |
| new invoice form has date and contractor fields | authenticated                                    | inputs `issueDate`, `saleDate`, `contractorId` present                                       |
| new invoice form can add and remove line items  | click "+ Dodaj pozycję"                          | second line row appears; click remove → one row remains                                      |
| new invoice form cancel returns to list         | click "Anuluj"                                   | URL becomes `/dashboard/invoices`                                                            |


---

### `navigation.spec.ts`


| Test                                                   | Setup                                   | Assertion                                                                                           |
| ------------------------------------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| sidebar shows all navigation items                     | authenticated, navigate to `/dashboard` | links "Przegląd", "Faktury wychodzące", "Faktury przychodzące", "Kontrahenci", "Ustawienia" visible |
| clicking Kontrahenci navigates to contractors page     | click nav link "Kontrahenci"            | URL becomes `/dashboard/contractors`                                                                |
| clicking Faktury wychodzące navigates to invoices page | click nav link "Faktury wychodzące"     | URL becomes `/dashboard/invoices`                                                                   |
| clicking Ustawienia navigates to settings page         | click nav link "Ustawienia"             | URL becomes `/dashboard/settings`                                                                   |
| settings page loads with members section               | navigate to `/dashboard/settings`       | heading "Ustawienia", text "Członkowie" visible                                                     |


---

---

### `household-onboarding-entrypoint.spec.ts`

Covers the Phase 1 company-vs-household entrypoint at `/onboarding`: a signed-in user with
neither a company nor a household picks a side, and the household path leads into the
household onboarding wizard's first step.

| Test | Setup | Assertion |
| --- | --- | --- |
| entrypoint choice screen renders | `onboardingPage` (no company, no household), navigate to `/onboarding` | heading "Co chcesz skonfigurować najpierw?"; links to `/onboarding/company` and `/household/onboarding/household` visible |
| household path leads into the household wizard | click "Rozpocznij konfigurację domu" | URL becomes `/household/onboarding/household`; heading "Nazwij swoje gospodarstwo domowe" visible |

The company path (`-> /onboarding/company`) and the "no company at all" auto-redirect from
`/dashboard` are already covered by `onboarding.spec.ts` — intentionally not duplicated here.

---

### `household-ledger.spec.ts`

Covers the Phase 1 household journey from create household through account, a categorized
transaction, envelope progress, a commitment, and a transfer excluded from income/spend sums.

| Test | Setup | Assertion |
| --- | --- | --- |
| create household -> account -> transaction -> envelope + commitment on dashboard, transfer excluded | `onboardingPage`, full flow: create household, add two accounts, add a categorized expense, add a commitment, seed one transfer between the two accounts via a direct API call | ledger shows the transaction and both transfer legs; dashboard "Wpływy"/"Wydatki" stat cards and the Groceries envelope's spent total are unaffected by the transfer; "Nadchodzące płatności" shows the new commitment |
| a PRIVATE account is omitted from another member's view | `authenticatedHouseholdOwnerPage` + `authenticatedHouseholdMemberPage` (static `TEST_HOUSEHOLD` fixture, two separate browser contexts) | owner's `/household/settings/accounts` shows both the SHARED and their own PRIVATE account with a "Prywatne" badge; the other member's same page shows the SHARED account only — the PRIVATE account and badge are absent entirely, not shown redacted |

**Known frontend gaps surfaced while building this spec** (not test bugs — flagged for
frontend-engineer, worked around rather than silently assumed away):

- No "add budget envelope" form exists anywhere in the Phase 1 frontend
  (`app/household/(app)/envelopes/page.tsx` only ever reads `GET .../envelopes`). The mock API
  pre-seeds one Groceries envelope per household so "a categorized transaction updates envelope
  progress" is still exercised end to end — this is a mock-only accommodation, not a claim that
  the real backend auto-seeds envelopes (it doesn't; see `household.service.ts`'s
  `createHousehold`, which only seeds categories + the owner membership).
- No UI exists to create a transfer between accounts (`createTransfer` / `POST
  .../transfers` exists only in `apps/api`'s household routes, with no corresponding
  `lib/api-client.ts` export or form). The transfer step is seeded with a direct
  `page.request.post` call carrying the real request contract instead of a UI action; the
  ledger and dashboard assertions that follow it are real UI checks.
- `FormField` (`components/molecules/FormField.tsx`) renders a visible `<label>` but never
  wires `htmlFor`/`id` to its control, so `getByLabel()` cannot resolve any household form
  field except `AccountPicker` (which sets its own `aria-label`). The tests fall back to CSS
  label-adjacency selectors (`label:has-text("...") + input`) and `getByPlaceholder()` where a
  placeholder happens to exist — this is a real accessibility gap (these fields are not
  associated with their labels for screen readers either), worth fixing in `FormField` itself
  rather than only working around in tests.

## Implementation Notes

- **JWT signing**: Use `jsonwebtoken` package. Add as devDependency to `apps/e2e/package.json` if not present.
- **Session shape**: Verify payload structure against `apps/web/src/lib/auth.ts` before implementing the fixture.
- **Empty states are acceptable**: List pages will render empty — tests assert page structure, not data.
- **Out of scope**: Data-driven tests (actual contractor/invoice creation via form submit) require a live API + DB and belong in a future integration test phase.
- **Selector priority**: `getByRole` &gt; `getByLabel` &gt; `getByPlaceholder` &gt; `getByText`. Avoid CSS selectors.
- **Navigation selectors**: Scope dashboard sidebar navigation clicks to the `Nawigacja dashboardu` landmark so tests only target primary navigation links, not similarly named quick actions.
- **Test isolation**: Each test navigates independently. No shared state between tests.
- **Household mock fixtures**: `mock-api/server.js` keeps household state in a `households` `Map`
  keyed by household id, each entry holding its own accounts/categories/transactions/
  commitments/envelopes and a `members` map from auth token to member record — mirroring the
  real backend's live-membership-lookup model (no JWT `households` claim). `TEST_HOUSEHOLD` is a
  static fixture pre-populated with one SHARED and one PRIVATE account plus two members (an
  OWNER and "Anna", a second MEMBER), for tests that only read fixture state and want it stable
  across parallel runs. Household-creation flows (`POST /households`) instead use the same
  unique-per-test-id token pattern as `onboardingPage`, since each test mutates its own
  household and a shared token would let parallel runs collide.
- **Two simultaneous household actors**: `authenticatedHouseholdOwnerPage` and
  `authenticatedHouseholdMemberPage` each open their own `browser.newContext()` rather than
  reusing the test's shared `page` fixture — cookies live at the browser-context level, so two
  fixtures both requesting `{ page }` would silently overwrite the same cookie jar when used
  together in one test.

## Running Tests

```bash
# Run all e2e tests
pnpm test:e2e

# Run a specific file
pnpm --filter @ksiegowy/e2e exec playwright test tests/contractors.spec.ts

# Run tests by file-name filter (passed through `test`'s script)
pnpm --filter @ksiegowy/e2e test -- household-ledger household-onboarding-entrypoint

# UI mode for debugging
pnpm --filter @ksiegowy/e2e test:ui

# View last report
pnpm --filter @ksiegowy/e2e report
```

Expected outcome: ~20 new tests passing, with no flakiness on CI.
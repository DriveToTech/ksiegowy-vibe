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
  smoke.spec.ts              ← existing (home + login page loads)
  fixtures/
    auth.ts                  ← shared auth fixture (inject JWT cookie)
  dashboard.spec.ts          ← dashboard overview tests
  contractors.spec.ts        ← contractor list and form tests
  invoices.spec.ts           ← invoice list and form tests
  navigation.spec.ts         ← sidebar navigation tests
```

## Files to Create / Modify

| File | Action | Purpose |
|------|--------|---------|
| `tests/fixtures/auth.ts` | Create | Playwright fixture injecting auth cookie |
| `playwright.config.ts` | Modify | Forward `JWT_SECRET` env var to web server |
| `tests/dashboard.spec.ts` | Create | Dashboard overview |
| `tests/contractors.spec.ts` | Create | Contractor list, create form |
| `tests/invoices.spec.ts` | Create | Invoice list, new invoice form |
| `tests/navigation.spec.ts` | Create | Sidebar navigation and routing |

---

## Test Cases

### `fixtures/auth.ts`

- Export an extended `test` with an `authenticatedPage` fixture
- Fixture injects cookie `auth_token` via `page.context().addCookies()`
- Static test data — no DB required

---

### `dashboard.spec.ts`

| Test | Setup | Assertion |
|------|-------|-----------|
| dashboard redirects unauthenticated users to login | no cookie, navigate to `/dashboard` | URL becomes `/login` |
| dashboard loads with all metric cards | authenticated, navigate to `/dashboard` | headings: "Panel operacyjny", "Faktury w tym miesiącu", "Oczekuje na KSeF", "Łączna sprzedaż" |
| dashboard shows quick action links | authenticated | links: "+ Nowa faktura", "Prześlij fakturę przychodzącą", "Zarządzaj zespołem" |
| dashboard shows empty state without company | authenticated, no active company | text "Brak skonfigurowanej firmy", button "Przejdź do ustawień" |

---

### `contractors.spec.ts`

| Test | Setup | Assertion |
|------|-------|-----------|
| contractors list page loads | authenticated, navigate to `/dashboard/contractors` | heading "Kontrahenci", button "Dodaj kontrahenta" visible |
| contractors list shows search and filter controls | authenticated | search input placeholder "Szukaj po nazwie lub NIP…", buttons "Wszyscy", "Aktywni", "Nieaktywni" |
| contractors list shows empty state | authenticated, no contractors in DB | empty state text visible |
| new contractor form loads | navigate to `/dashboard/contractors/new` | heading "Nowy kontrahent", fields `contractor-name`, `contractor-nip`, `contractor-email` visible |
| new contractor form validates required fields | submit empty form | validation error(s) visible |
| new contractor form cancel returns to list | click "Anuluj" | URL becomes `/dashboard/contractors` |

---

### `invoices.spec.ts`

| Test | Setup | Assertion |
|------|-------|-----------|
| invoices list page loads | authenticated, navigate to `/dashboard/invoices` | heading "Faktury sprzedażowe", metric cards visible |
| invoices list shows new invoice button | authenticated | link "+ Nowa faktura" visible |
| new invoice form loads | navigate to `/dashboard/invoices/new` | heading "Nowa faktura" visible |
| new invoice form has all required sections | authenticated | section headings: "Dane Dokumentu", "Pozycje faktury", "Szczegóły płatności", "Podsumowanie" |
| new invoice form has date and contractor fields | authenticated | inputs `issueDate`, `saleDate`, `contractorId` present |
| new invoice form can add and remove line items | click "+ Dodaj pozycję" | second line row appears; click remove → one row remains |
| new invoice form cancel returns to list | click "Anuluj" | URL becomes `/dashboard/invoices` |

---

### `navigation.spec.ts`

| Test | Setup | Assertion |
|------|-------|-----------|
| sidebar shows all navigation items | authenticated, navigate to `/dashboard` | links "Przegląd", "Faktury wychodzące", "Faktury przychodzące", "Kontrahenci", "Ustawienia" visible |
| clicking Kontrahenci navigates to contractors page | click nav link "Kontrahenci" | URL becomes `/dashboard/contractors` |
| clicking Faktury wychodzące navigates to invoices page | click nav link "Faktury wychodzące" | URL becomes `/dashboard/invoices` |
| clicking Ustawienia navigates to settings page | click nav link "Ustawienia" | URL becomes `/dashboard/settings` |
| settings page loads with members section | navigate to `/dashboard/settings` | heading "Ustawienia", text "Członkowie" visible |

---

## Implementation Notes

- **JWT signing**: Use `jsonwebtoken` package. Add as devDependency to `apps/e2e/package.json` if not present.
- **Session shape**: Verify payload structure against `apps/web/src/lib/auth.ts` before implementing the fixture.
- **Empty states are acceptable**: List pages will render empty — tests assert page structure, not data.
- **Out of scope**: Data-driven tests (actual contractor/invoice creation via form submit) require a live API + DB and belong in a future integration test phase.
- **Selector priority**: `getByRole` > `getByLabel` > `getByPlaceholder` > `getByText`. Avoid CSS selectors.
- **Navigation selectors**: Scope dashboard sidebar navigation clicks to the `Nawigacja dashboardu` landmark so tests only target primary navigation links, not similarly named quick actions.
- **Test isolation**: Each test navigates independently. No shared state between tests.

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

Expected outcome: ~20 new tests passing, with no flakiness on CI.

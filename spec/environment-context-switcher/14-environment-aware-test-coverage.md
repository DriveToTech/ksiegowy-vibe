# Ticket 14: Add Automated Tests For Environment-Aware Behavior

## Slice
- `Slice 2`

## Status
- Implemented baseline; release and operational validation remains.

## Goal
Add API, frontend, and E2E coverage for the new environment separation rules and user switching flow.

## Files
- `apps/api/src/**/*.test.ts`
- `apps/e2e/tests/**/*.spec.ts`
- Any existing frontend test locations used by the repo

## Dependencies
- `13-ksef-action-safety-ux.md`

## Tasks
1. Cover environment resolver behavior.
2. Cover company plus environment session separation.
3. Cover invoice state separation by environment.
4. Cover shell switching and persistence.
5. Cover blocked KSeF actions when the selected environment has no token.

## Acceptance Criteria
1. API tests cover environment resolution and session separation.
2. API tests cover invoice state separation and correction behavior.
3. E2E coverage proves switching survives refresh and affects KSeF actions.
4. Missing-token blocking behavior is covered.

## Done

### API test coverage added (130 tests passing, typecheck clean)

**New test files created:**
- `apps/api/src/lib/ksef-environment.test.ts` — 21 tests covering `readRequestedKsefEnvironment()` and `resolveEffectiveKsefEnvironment()`: header and direct-resource query parsing, header precedence, invalid value rejection, company default fallback, caching on `request.ksefEnvironment`, and company-not-found error.
- `apps/api/src/routes/invoices/outgoing.test.ts` — 7 tests covering `resolveInvoiceKsefState()` (NOT_SENT default, matching state, first-match with multiple states) and `buildInvoiceKsefStateInclude()` (correct Prisma include shape for TEST and PRODUCTION).
- `apps/api/src/services/ksef-incoming.service.test.ts` — 3 tests covering environment-scoped deduplication: Case A findFirst includes `ksefEnvironment` filter, Case B link findFirst includes `ksefEnvironment` filter, Case C create sets `ksefEnvironment` on new records.
- `apps/api/src/routes/ksef.test.ts` — 2 integration tests covering the queue endpoint: queries `InvoiceKsefState` with environment filter, returns status from `InvoiceKsefState` (not legacy `Invoice.ksefStatus`), and respects company default environment.

**Environment safety coverage:** direct PDF/file resources accept only validated `TEST` or `PRODUCTION` query context, credential-status reads expose presence only to company members, and web KSeF controls fail closed when status is unavailable.

**Mutation transport contract:** financially scoped and KSeF-sensitive mutations require exactly one `x-ksef-environment` header with `TEST` or `PRODUCTION`. They must not infer the target environment from a cookie or company default; missing, repeated, or invalid values are rejected. Read-only resolution may retain compatibility fallbacks.

**Verification boundary:** the recorded API result is 130 tests passing with a clean typecheck. This coverage does not prove that Prisma migrations were applied to a shared database or that live KSeF submission, status polling, or manual reconciliation succeeded.

**Rollout gate:** apply and preflight the migration set against real staging data, take and verify a backup before production rollout, and use an application-compatible rollback or a forward migration. A successful Prisma migration is not undone by rolling back the application; unsafe schema/data state requires an isolated restore and cutover.

**Existing test file extended:**
- `apps/api/src/services/ksef.service.test.ts` — added 8 new tests across 3 new describe blocks:
  - `getOrCreateKsefSession()`: TEST session exists but PRODUCTION doesn't → triggers `initKsefSession`; both exist → each uses its own session via `companyId_environment` compound key.
  - `upsertInvoiceKsefState()`: uses `invoiceId_environment` compound unique key; TEST and PRODUCTION states coexist independently for the same invoice.
  - `loadCompanyKsefAuthConfiguration()`: returns per-environment credential token; throws when no token configured; falls back to legacy token only when `company.ksefEnv` matches `selectedEnvironment`; does not fall back to legacy token on mismatch; falls back to `KSEF_AUTH_TOKEN` env var only for TEST; does not use env var for PRODUCTION; throws when company not found.

**Source changes (exports added for testability):**
- `apps/api/src/services/ksef.service.ts`: exported `upsertInvoiceKsefState` and `loadCompanyKsefAuthConfiguration`.
- `apps/api/src/routes/invoices/outgoing.ts`: exported `buildInvoiceKsefStateInclude` and `resolveInvoiceKsefState`.

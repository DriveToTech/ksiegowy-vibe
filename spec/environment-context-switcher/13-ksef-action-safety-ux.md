# Ticket 13: Add Environment Safety UX To KSeF Actions

## Slice
- `Slice 2`

## Goal
Show the active environment in risky KSeF actions and block actions when the selected environment is not configured.

## Files
- `apps/web/src/app/dashboard/invoices/[id]/InvoiceActions.tsx`
- `apps/web/src/app/dashboard/incoming/KsefSyncButton.tsx`
- Related action and status components

## Dependencies
- `06-ksef-settings-ui.md`
- `07-shell-indicator-and-switcher.md`
- `12-environment-aware-read-models-and-reports.md`

## Tasks
1. Show the active environment in submit, status-check, sync, and correction actions.
2. Use stronger confirmation language for `PRODUCTION` actions.
3. Block KSeF actions when the selected environment has no token configured.
4. Provide a direct path to settings when configuration is missing.

## Acceptance Criteria
1. Risky KSeF actions always show the active environment.
2. `PRODUCTION` actions feel more explicit than `TEST` actions.
3. Missing token blocks KSeF actions safely.
4. Users can navigate directly to settings from the blocking state.

## Done

All four acceptance criteria implemented. Changes summary:

### Files modified

1. **`apps/web/src/lib/translations.ts`** — Added translation keys:
   - `invoiceActions.productionConfirm` — PRODUCTION confirmation dialog message
   - `invoiceActions.missingTokenWarning(environment)` — Token-missing warning with environment name
   - `invoiceActions.goToSettings` — Link text to settings page
   - `incoming.ksefSync.productionConfirm` — PRODUCTION sync confirmation dialog message
   - `incoming.ksefSync.missingTokenWarning(environment)` — Token-missing warning for sync
   - `incoming.ksefSync.goToSettings` — Link text to settings page
   - `incoming.ksefSync.environmentLabel` — "Środowisko KSeF" label

2. **`apps/web/src/app/dashboard/invoices/[id]/InvoiceActions.tsx`** — Environment safety UX:
   - Added `ksefCredentialStatuses` optional prop (backward compatible)
   - Reads active KSeF environment from browser cookie via `getActiveKsefEnvironmentFromBrowser()`
   - `EnvironmentBadge` component renders colored pill (green for TEST, amber for PRODUCTION) on KSeF action buttons
   - KSeF submit, check-status, and correction buttons show the environment badge
   - All KSeF buttons disabled when `hasToken === false` for the active environment
   - Inline warning with link to `/dashboard/settings` shown when token is missing
   - `window.confirm()` guard before submit and correction when environment is PRODUCTION

3. **`apps/web/src/app/dashboard/incoming/KsefSyncButton.tsx`** — Environment safety UX:
   - Added `ksefCredentialStatuses` optional prop (backward compatible)
   - Reads active KSeF environment from browser cookie
   - `EnvironmentBadge` shown next to modal title
   - Environment label displayed below date inputs
   - Confirm button disabled when token is missing
   - Inline warning with link to `/dashboard/settings` shown when token is missing
   - `window.confirm()` guard before sync when environment is PRODUCTION

4. **`apps/web/src/app/dashboard/invoices/[id]/page.tsx`** — Server component fetches `CompanyKsefSettings` and passes `credentials` array to `InvoiceActions`

5. **`apps/web/src/app/dashboard/incoming/page.tsx`** — Server component fetches `CompanyKsefSettings` and passes `credentials` array to `KsefSyncButton`

### Typecheck result
`pnpm --filter web exec tsc --noEmit` — passed with zero errors.

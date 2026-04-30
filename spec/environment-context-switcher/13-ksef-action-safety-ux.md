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

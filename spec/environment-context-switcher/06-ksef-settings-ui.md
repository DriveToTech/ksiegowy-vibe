# Ticket 06: Rebuild The Settings UI For Per-Environment KSeF Management

## Slice
- `Slice 1`

## Goal
Replace the current single KSeF settings form with separate environment cards and a separate company default environment control.

## Files
- `apps/web/src/app/dashboard/settings/KsefSettingsForm.tsx`
- `apps/web/src/app/dashboard/settings/page.tsx`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/lib/api-types.ts`

## Dependencies
- `05-ksef-settings-api.md`

## Tasks
1. Show separate `TEST` and `PRODUCTION` credential sections.
2. Show whether each environment has a configured token.
3. Let admin update one environment without touching the other.
4. Add a separate control for the company default KSeF environment.

## Acceptance Criteria
1. Settings expose separate credential state for both environments.
2. Admin can update one environment independently.
3. Admin can change the company default environment independently.
4. UI no longer couples token save with environment switching.

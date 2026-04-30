# Ticket 11: Make Incoming KSeF Sync Environment-Aware

## Slice
- `Slice 2`

## Goal
Tag sync runs and KSeF-linked incoming invoice records with the selected environment, and avoid cross-environment deduplication.

## Files
- `apps/api/src/services/ksef-incoming.service.ts`
- `apps/api/src/routes/invoices/incoming.ts`

## Dependencies
- `08-environment-aware-ksef-auth.md`

## Tasks
1. Store the environment on every KSeF incoming sync run.
2. Store the environment on KSeF-linked incoming invoice records.
3. Deduplicate and link records only within the same environment.
4. Preserve existing incoming sync business flow where environment is the only new boundary.

## Acceptance Criteria
1. Sync runs are attributable to one environment.
2. KSeF-linked incoming invoices are attributable to one environment.
3. `TEST` and `PRODUCTION` sync data do not collide.
4. Existing sync behavior still works inside a single environment.

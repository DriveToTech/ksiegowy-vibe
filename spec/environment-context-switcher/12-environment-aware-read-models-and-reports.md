# Ticket 12: Align KSeF Queue Endpoints, Invoice Read Models, And Reports With Active Environment

## Slice
- `Slice 2`

## Goal
Update API read paths that expose KSeF status or reference so they return the active environment's state instead of legacy global values.

## Files
- `apps/api/src/routes/invoices/outgoing.ts`
- `apps/api/src/routes/ksef.ts`
- `apps/api/src/routes/reports.ts`

## Dependencies
- `09-environment-aware-invoice-ksef-state.md`
- `11-environment-aware-incoming-sync.md`

## Tasks
1. Resolve invoice detail KSeF status from the active environment.
2. Resolve queue endpoints from the active environment.
3. Resolve reports and exports from the active environment.
4. Remove silent mixing of `TEST` and `PRODUCTION` values in read models.

## Acceptance Criteria
1. Invoice detail responses expose environment-correct KSeF values.
2. Queue endpoints use environment-specific state.
3. Reports and exports use the selected environment's KSeF values.
4. No read endpoint silently mixes environments.

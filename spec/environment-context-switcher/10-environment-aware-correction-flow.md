# Ticket 10: Make Correction Flow Environment-Specific

## Slice
- `Slice 2`

## Goal
Require the original invoice to be accepted in the active environment before allowing correction, and use the accepted reference from that environment.

## Files
- `apps/api/src/routes/invoices/outgoing.ts`

## Dependencies
- `09-environment-aware-invoice-ksef-state.md`

## Tasks
1. Validate accepted status in the active environment before correction.
2. Resolve the original KSeF reference from the active environment.
3. Remove assumptions about one global accepted KSeF reference per invoice.

## Acceptance Criteria
1. Correction is blocked when the original invoice is not accepted in the active environment.
2. Correction uses the active environment's accepted KSeF reference.
3. Correction rules no longer depend on legacy global KSeF state.

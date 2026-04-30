# Ticket 09: Move Invoice KSeF State To Environment-Aware Read And Write Paths

## Status
- Ticket: `completed`

## Slice
- `Slice 2`

## Goal
Update invoice submit, poll, and status flows to read and write `InvoiceKsefState` instead of relying on one global KSeF state on the invoice.

## Files
- `apps/api/src/services/ksef.service.ts`
- `apps/api/src/routes/invoices/outgoing.ts`

## Dependencies
- `08-environment-aware-ksef-auth.md`

## Tasks
1. Write `KsefSubmission.environment` during submission.
2. Create or update `InvoiceKsefState(invoiceId, environment)` on submit, accept, reject, and offline queue transitions.
3. Read invoice KSeF status from the active environment.
4. Keep the response model stable while shifting the source of truth.

## Acceptance Criteria
1. Invoice KSeF state is stored per environment.
2. Polling and acceptance update only the active environment's state.
3. The same invoice can hold different KSeF states for `TEST` and `PRODUCTION`.
4. API responses expose environment-correct status.

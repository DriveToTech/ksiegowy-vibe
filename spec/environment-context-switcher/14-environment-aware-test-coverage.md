# Ticket 14: Add Automated Tests For Environment-Aware Behavior

## Slice
- `Slice 2`

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

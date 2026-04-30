# Ticket 05: Replace The Current KSeF Settings API With Environment-Aware Endpoints

## Slice
- `Slice 1`

## Goal
Refactor the company KSeF settings API so admins can manage credentials for `TEST` and `PRODUCTION` independently and update the company default environment separately.

## Files
- `apps/api/src/routes/companies.ts`

## Dependencies
- `01-persistence-foundation.md`
- `03-api-environment-resolver.md`

## Tasks
1. Add a read endpoint for KSeF settings state.
2. Add a write endpoint for saving one environment's token.
3. Add a separate endpoint for changing the company default environment.
4. Invalidate only the matching environment session when its token changes.

## Acceptance Criteria
1. Admin can inspect both `TEST` and `PRODUCTION` credential states.
2. Updating one environment does not overwrite the other environment.
3. Company default environment can be changed independently.
4. Session invalidation is scoped to the updated environment only.

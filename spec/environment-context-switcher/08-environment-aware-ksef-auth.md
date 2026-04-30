# Ticket 08: Refactor KSeF Credential And Session Services To Be Environment-Aware

## Slice
- `Slice 2`

## Goal
Update backend KSeF authentication and refresh flows so they use the selected environment's credentials and refresh token cache.

## Files
- `apps/api/src/services/ksef.service.ts`

## Dependencies
- `01-persistence-foundation.md`
- `02-legacy-ksef-backfill.md`
- `03-api-environment-resolver.md`

## Tasks
1. Read credentials from `CompanyKsefCredential` instead of legacy company token fields.
2. Resolve refresh sessions by company and environment.
3. Pass environment explicitly through KSeF auth and refresh flows.
4. Keep fallback behavior controlled during rollout.

## Acceptance Criteria
1. `TEST` and `PRODUCTION` refresh tokens never overwrite each other.
2. Auth uses the selected environment's credentials.
3. Refresh behavior remains stable within one environment.
4. Legacy fallback is limited and explicit where still required.

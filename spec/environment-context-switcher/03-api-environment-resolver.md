# Ticket 03: Add Effective KSeF Environment Resolver In The API

## Status
- Ticket: `completed`

## Slice
- `Slice 1`

## Goal
Introduce one backend mechanism that resolves the effective KSeF environment from request context while making financially scoped mutations explicit.

## Files
- `apps/api/src/lib/`
- `apps/api/src/plugins/cors.ts`
- KSeF-sensitive route files

## Dependencies
- `01-persistence-foundation.md`

## Tasks
1. Create a shared resolver that accepts only `TEST` or `PRODUCTION`.
2. Read `x-ksef-environment` on KSeF-sensitive requests.
3. Require exactly one valid header for financially scoped and KSeF-sensitive mutations; retain company fallback only for compatible read-only paths during rollout.
4. Allow the custom header in CORS for browser-originated requests.

## Acceptance Criteria
1. API resolves one explicit effective environment for KSeF-sensitive operations.
2. Invalid environment values are rejected consistently.
3. Missing or repeated mutation headers are rejected; read-only compatibility fallbacks are documented and bounded.
4. Browser requests can send the custom header without CORS errors.

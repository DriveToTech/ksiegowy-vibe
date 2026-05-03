# Ticket 03: Add Effective KSeF Environment Resolver In The API

## Status
- Ticket: `completed`

## Slice
- `Slice 1`

## Goal
Introduce one backend mechanism that resolves the effective KSeF environment from request context and falls back to the company default when needed.

## Files
- `apps/api/src/lib/`
- `apps/api/src/plugins/cors.ts`
- KSeF-sensitive route files

## Dependencies
- `01-persistence-foundation.md`

## Tasks
1. Create a shared resolver that accepts only `TEST` or `PRODUCTION`.
2. Read `x-ksef-environment` on KSeF-sensitive requests.
3. Fallback to `Company.ksefEnv` when no explicit environment is provided.
4. Allow the custom header in CORS for browser-originated requests.

## Acceptance Criteria
1. API resolves one explicit effective environment for KSeF-sensitive operations.
2. Invalid environment values are rejected consistently.
3. Missing headers fall back cleanly to the company default environment.
4. Browser requests can send the custom header without CORS errors.

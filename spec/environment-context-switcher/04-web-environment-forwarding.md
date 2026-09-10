# Ticket 04: Persist Active Environment In The Web App And Forward It To The API

## Status
- Ticket: `completed`

## Slice
- `Slice 1`

## Goal
Store the current user's active KSeF environment in the web app and ensure both server-side and browser-side requests send it to the API.

## Files
- `apps/web/src/lib/auth.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/api-client.ts`

## Dependencies
- `03-api-environment-resolver.md`

## Tasks
1. Persist active environment synchronously in the company-scoped `active_ksef_environment_{companyId}` cookie with a 30-day max age, `path=/`, and `SameSite=Lax`.
2. Read that cookie on server-rendered KSeF requests.
3. Forward the active environment in browser-side KSeF mutations.
4. Keep non-KSeF requests decoupled from unnecessary environment logic.

## Acceptance Criteria
1. Active environment survives refresh.
2. Server-rendered KSeF requests include the effective environment.
3. Browser-originated KSeF mutations include the effective environment.
4. The transport contract matches the API resolver contract.

The shell switch does not call a server persistence endpoint. Browser and server mutation clients send the explicit `x-ksef-environment: TEST|PRODUCTION` header; read-only compatibility paths may still use the active cookie during rollout.

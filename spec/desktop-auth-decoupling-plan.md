# Desktop Auth Decoupling Plan

## Status

- `in_progress`

## Objective

Refactor the current desktop-specific OAuth handoff into a generic client auth flow that:

- keeps web login unchanged
- lets desktop remain a first-class client without desktop-only API coupling
- moves one-time auth handoff state out of API process memory
- preserves current localhost gateway and cookie-based session model

## Current Issues

1. **Desktop-specific logic is embedded in shared auth routes**
   - `apps/api/src/routes/auth/google.ts` still owns both browser login and client handoff orchestration, even though the transport contract is now generic.
2. **Desktop terminology leaks into generic auth flow**
   - this has been reduced, but callback naming and some UI/runtime wording still reflect the desktop-first implementation.
3. **Persistence is not production-safe**
   - resolved: auth handoff records are stored in PostgreSQL through Prisma.
4. **Web UI naming is misleading**
   - resolved in code, but docs and remaining UX copy should continue moving toward client-generic language where useful.
5. **Desktop gateway is coupled to one auth exchange path**
   - resolved: the gateway now proxies only `/auth/client/exchange` for auth handoff completion.

## Target Design

Introduce a **generic client auth handoff flow** with two clear modes:

- **Browser mode**
  - `GET /auth/google` → Google callback → set auth cookies → redirect to app
- **Client handoff mode**
  - client starts login with generic auth parameters
  - API stores a short-lived one-time auth handoff record
  - OAuth callback resolves to a client callback URL with a one-time handoff code
  - client exchanges the handoff code for normal auth cookies via a generic exchange endpoint

### Proposed contract

- Replace desktop-specific request fields with generic client fields:
  - `clientTransactionId`
  - `clientCodeChallenge`
  - `clientCallbackUrl`
  - optional `clientPlatform`
- Replace `/auth/desktop/exchange` with `/auth/client/exchange`
- Keep PKCE-style verifier/challenge and one-time handoff semantics
- Keep Electron-specific deep link and preload handling inside `apps/desktop` only

## Phased Plan

### Phase 1 — Stabilize current flow

Goal: make the current implementation safer before renaming contracts.

Tasks:
1. Extract desktop handoff logic from `apps/api/src/routes/auth/google.ts` into a dedicated auth handoff service or module.
2. Add explicit types for:
   - auth request state
   - handoff record
   - exchange payload
3. Add TTL, single-use, and cleanup coverage around the current handoff store.
4. Add regression tests around:
   - normal browser login
   - current desktop login success path
   - expired or reused handoff code
   - mismatched verifier or transaction id
5. Document current limitation in `docs/desktop-architecture.md` and link this refactor plan from `README.md`.

Exit criteria:
- current behavior is unchanged
- logic is isolated enough to rename without reworking the whole auth route

### Phase 2 — Introduce generic client auth flow

Goal: replace desktop-specific API contracts with generic client auth contracts.

Progress note:

- `apps/api` now exposes `POST /auth/client/exchange` as the primary route.
- `apps/api/src/routes/auth/google.ts` now delegates auth session logic and client handoff logic to dedicated modules.
- `apps/desktop/src/main.ts` now starts Google OAuth on the desktop gateway origin with generic `clientTransactionId` and `clientCodeChallenge` query fields.

Tasks:
1. Introduce generic request parsing in API auth routes:
   - generic client auth request state
   - generic client callback builder
   - generic exchange route: `/auth/client/exchange`
2. Remove the legacy `/auth/desktop/exchange` compatibility route after the generic flow is validated.
3. [x] Update `apps/desktop/src/main.ts` to use generic field names internally while still owning desktop deep-link behavior.
4. Update `apps/desktop/src/desktop-gateway.ts` to proxy `/auth/client/exchange`.
5. Rename `apps/web/src/components/auth/DesktopGoogleLoginButton.tsx` to a generic client-aware component, for example `GoogleLoginButton.tsx`.
6. Keep the browser fallback path unchanged on `apps/web/src/app/login/page.tsx`.

Exit criteria:
- API auth flow no longer encodes desktop-specific concepts in its primary contract
- desktop app works through the generic client exchange endpoint
- browser login still works exactly as today

### Phase 3 — Move handoff storage to persistence

Goal: remove single-process coupling.

Progress note:

- `apps/api` now persists client auth handoff records in PostgreSQL via Prisma.
- The API stores only hashed handoff codes.
- TTL and single-use consumption are enforced during exchange.
- the legacy `/auth/desktop/exchange` route has been removed.

Tasks:
1. Add a shared persistence model for auth handoff records in `apps/api`:
   - one-time code hash
   - transaction id
   - code challenge
   - callback URL
   - user id
   - expires at
   - consumed at
2. Prefer **PostgreSQL-backed persistence** first to fit the current stack and avoid introducing Redis only for this flow.
3. Enforce:
   - short TTL
   - single-use consumption
   - server-side expiration cleanup
4. Keep hashed handoff code storage only; never persist raw one-time code.
5. Add tests for multi-instance-safe exchange behavior.

Exit criteria:
- auth handoff survives API process restart within TTL
- no in-memory-only auth dependency remains for the main flow

### Phase 4 — Cleanup

Goal: remove legacy desktop-specific auth artifacts.

Tasks:
1. Remove compatibility route `/auth/desktop/exchange`.
2. Remove desktop-specific naming from API auth code and tests.
3. Remove temporary migration comments and compatibility branches.
4. Update:
   - `docs/desktop-architecture.md`
   - `docs/development-run-modes.md`
   - `README.md`
5. Confirm desktop-specific concerns live only in:
   - `apps/desktop`
   - web runtime detection and preload usage
   - desktop callback page UX

Exit criteria:
- auth API is client-generic
- desktop remains an implementation detail at the edge, not in the shared auth domain

## Risks

- **Login regression risk**: shared auth routes affect both browser and desktop login.
- **Callback trust boundary risk**: generic callback URL support can become an open redirect if not tightly validated.
- **Session establishment risk**: cookie behavior must remain same-origin through the desktop gateway.
- **Migration risk**: partial rollout can break older desktop builds if compatibility alias is removed too early.
- **Persistence complexity**: adding durable handoff storage changes auth critical-path behavior.

## Validation Checklist

- [ ] Browser login from `/login` still redirects and sets cookies correctly
- [ ] Desktop login still starts in system browser and returns through deep link
- [ ] `apps/desktop` exchanges auth through the generic client endpoint
- [x] Reused handoff codes are rejected
- [x] Expired handoff codes are rejected
- [ ] Mismatched verifier or transaction id is rejected
- [x] API restart does not invalidate a valid pending handoff
- [ ] Callback URL validation blocks untrusted origins and protocols
- [x] `pnpm --filter @ksiegowy/api test -- src/routes/auth/google.test.ts` passes
- [ ] Desktop smoke flow still works in run mode 4
- [x] Legacy desktop field names are rejected
- [x] Legacy `/auth/desktop/exchange` route is removed

## Rollback Strategy

1. Ship the generic flow without the legacy compatibility route now that the desktop runtime has been moved.
2. If regressions appear:
   - revert desktop client to the legacy exchange path
   - switch API routing back to legacy desktop request parsing
   - keep persistence schema in place but unused if necessary
3. Reintroducing the legacy route should be done as an explicit revert if needed.

## Recommended Conventional Commit Sequence

1. `refactor(auth): isolate oauth handoff flow from google route`
2. `test(auth): cover browser and desktop handoff regression cases`
3. `refactor(auth): introduce generic client auth exchange contract`
4. `refactor(desktop): adopt generic client auth flow`
5. `feat(auth): persist client auth handoff records in postgresql`
6. `test(auth): cover durable handoff exchange and replay protection`
7. `chore(auth): remove legacy desktop exchange compatibility route`
8. `docs(auth): document generic client auth flow and desktop migration`

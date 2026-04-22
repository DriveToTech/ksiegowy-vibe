# Auth And Workflow Remediation Plan

## Status
- Overall: `planned`
- Scope:
  - fix authenticated session handling across web and API integration points
  - make web navigation and route access reflect real auth state
  - add missing company management flow
  - add missing contractor management flow required for invoice creation
  - remove false-empty states caused by expired or invalid sessions

## Objective
Restore a coherent authenticated product flow so that:
- logged-out users only see allowed public entry points
- logged-in users see their identity and do not see login-only navigation
- expired access tokens recover via refresh or redirect cleanly to login
- users with no company can create and maintain company data
- users can create contractors and then create invoices successfully

## Confirmed Findings
1. Web auth state is not modeled centrally.
   - `apps/web/src/components/organisms/AppHeader.tsx` is static.
   - `apps/web/src/app/layout.tsx` always renders the same public header.
   - `apps/web` does not consume `/auth/me`.

2. Route protection is based on cookie presence, not valid session state.
   - `apps/web/middleware.ts` only checks whether `auth_token` exists.

3. Access-token refresh is implemented on the API but not used by the web app.
   - `apps/api/src/routes/auth/google.ts` exposes `/auth/refresh`.
   - `apps/web/src/lib/api.ts` forwards only `auth_token`, not `refresh_token`.
   - no web-side refresh flow is present.

4. Dashboard routes often swallow auth/data failures and continue rendering.
   - affected examples include:
     - `apps/web/src/app/dashboard/layout.tsx`
     - `apps/web/src/app/dashboard/page.tsx`
     - `apps/web/src/app/dashboard/invoices/page.tsx`
     - `apps/web/src/app/dashboard/contractors/page.tsx`
     - `apps/web/src/app/dashboard/invoices/new/page.tsx`

5. Company API exists, but the web app has no company create/edit UI.
   - API support exists in `apps/api/src/routes/companies.ts`.

6. Contractor API exists, but the web app has no contractor create/edit UI.
   - API support exists in `apps/api/src/routes/contractors.ts`.

7. Invoice creation currently depends on contractors that users cannot create from the web UI.
   - `apps/web/src/app/dashboard/invoices/new/NewInvoiceForm.tsx` requires `contractorId`.

8. `/auth/me` returns only partial user information for the frontend.
   - current response omits `avatarUrl` even though it is persisted on login.

## Target User Flows

### 1. Logged-out user
- allowed routes:
  - `/login`
  - optional public `/` landing page
- blocked routes:
  - all `/dashboard/*`
- expected behavior:
  - redirect to `/login` before protected content renders

### 2. Logged-in user with valid session
- sees identity in the shell
- does not see login CTA
- can access dashboard routes normally
- can switch company if multiple memberships exist

### 3. Logged-in user with expired access token and valid refresh token
- server-side and client-side requests refresh session once
- user remains in context without losing the current flow

### 4. Logged-in user with no companies
- sees onboarding state instead of a broken or empty dashboard
- can create a company and continue into the dashboard

### 5. Logged-in user with company but no contractors
- sees clear empty state on contractors and invoice creation paths
- can add contractor and then create a draft invoice

## Delivery Phases

### Phase 1. Centralize session state in the web app
Targets:
- `apps/web/src/lib/api.ts`
- new session helper under `apps/web/src/lib/`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/dashboard/layout.tsx`

Tasks:
1. Add a server-side session helper that reads auth cookies and resolves the current user via `/auth/me`.
2. Return one normalized session object for web usage:
   - `authenticated`
   - `user`
   - `companies`
   - `activeCompanyId`
3. Remove manual JWT parsing from web pages such as `apps/web/src/app/dashboard/settings/page.tsx`.

Exit criteria:
- the web app has a single source of truth for authenticated user state
- dashboard layouts/pages no longer infer user identity from raw JWT parsing

### Phase 2. Fix refresh-token handling and invalid-session behavior
Targets:
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/middleware.ts`

Tasks:
1. Forward both `auth_token` and `refresh_token` from server-side web fetches.
2. Add one retry path for `401` responses:
   - call `/auth/refresh`
   - retry the original request once
3. If refresh fails, treat the session as unauthenticated.
4. Keep middleware as a coarse gate, but make layouts/pages authoritative for valid session checks.

Exit criteria:
- expired access tokens do not silently degrade dashboard data loading
- invalid sessions redirect to `/login` instead of rendering misleading empty states

### Phase 3. Make navigation and shell auth-aware
Targets:
- `apps/web/src/components/organisms/AppHeader.tsx`
- `apps/web/src/components/organisms/DashboardShell.tsx`
- `apps/web/src/app/layout.tsx`

Tasks:
1. Render login CTA only when unauthenticated.
2. Render user identity when authenticated:
   - name
   - email
   - avatar when available
3. Add logout action wired to `/auth/logout`.
4. Remove or restyle public-only navigation that should not appear inside authenticated flows.

Exit criteria:
- logged-in users can see who they are signed in as
- login CTA is not shown during authenticated sessions

### Phase 4. Stop masking auth failures as product empty states
Targets:
- `apps/web/src/app/dashboard/layout.tsx`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/dashboard/invoices/page.tsx`
- `apps/web/src/app/dashboard/invoices/new/page.tsx`
- `apps/web/src/app/dashboard/contractors/page.tsx`
- `apps/web/src/app/dashboard/settings/page.tsx`

Tasks:
1. Distinguish these states explicitly:
   - unauthenticated
   - authenticated with no companies
   - authenticated with no contractors
   - authenticated with no invoices
   - actual request error
2. Redirect unauthenticated requests.
3. Preserve empty states only for genuine business-empty conditions.

Exit criteria:
- dashboard screens reflect the real problem state instead of collapsing multiple failures into blank or empty UI

### Phase 5. Add company onboarding and company details editing
Targets:
- `apps/web/src/app/dashboard/settings/`
- optionally new onboarding route under `apps/web/src/app/dashboard/`
- `apps/web/src/lib/api-client.ts`

Tasks:
1. Add create-company form for users with no companies.
2. Add company edit form for mutable fields already supported by API:
   - `name`
   - `addressLine1`
   - `addressLine2`
   - `email`
   - `phone`
   - `bankName`
   - `bankAccount`
3. Respect role constraints:
   - `ADMIN` and `ACCOUNTANT` can edit
   - `VIEWER` cannot edit

Exit criteria:
- a user can create the first company from the web UI
- an authorized user can update company data from the web UI

### Phase 6. Add contractor creation and basic management
Targets:
- `apps/web/src/app/dashboard/contractors/page.tsx`
- optional contractor form component
- `apps/web/src/lib/api-client.ts`

Tasks:
1. Add contractor create form.
2. Support the minimum required fields for invoice workflows:
   - `name`
   - `nip`
   - `addressLine1`
   - `addressLine2`
   - `email`
   - `phone`
3. Consider in-page creation flow from invoice creation if contractor list is empty.

Exit criteria:
- a user can create a contractor from the web app
- the contractors list becomes actionable rather than read-only

### Phase 7. Repair invoice creation prerequisites and UX
Targets:
- `apps/web/src/app/dashboard/invoices/new/page.tsx`
- `apps/web/src/app/dashboard/invoices/new/NewInvoiceForm.tsx`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/dashboard/invoices/page.tsx`

Tasks:
1. Gate invoice creation on valid prerequisites:
   - authenticated user
   - active company
   - at least one contractor
2. Replace dead-end empty state with actionable path:
   - create company
   - create contractor
3. Keep existing draft-create API flow intact.

Exit criteria:
- first-time users can reach invoice creation successfully by following guided setup steps

### Phase 8. Enrich auth profile payload for UI needs
Targets:
- `apps/api/src/routes/auth/google.ts`
- `apps/web` session consumers

Tasks:
1. Extend `/auth/me` to return `avatarUrl`.
2. Keep the payload minimal, but sufficient for shell and account display.

Exit criteria:
- frontend auth-aware shell does not need to guess or decode extra profile fields manually

## Verification Plan

### Manual verification
1. Logged-out user opening `/dashboard` is redirected to `/login`.
2. Logged-in user sees name/email and no login CTA.
3. User with expired access token but valid refresh token remains signed in.
4. User with expired access and refresh tokens is redirected to `/login`.
5. User with no companies sees onboarding state.
6. User can create a company.
7. User can edit company details.
8. User can create a contractor.
9. User can create a draft invoice after contractor creation.

### Suggested automated coverage
API:
- auth route tests for `/auth/me`, `/auth/refresh`, `/auth/logout`
- company route tests for create/update role constraints
- contractor route tests for create role constraints

Web:
- middleware/session helper coverage where feasible
- optional E2E smoke flow:
  - login
  - create company
  - create contractor
  - create draft invoice

## Risks To Watch
- session refresh behavior diverging between server-rendered and client-rendered requests
- stale `active_company` cookie pointing to an inaccessible company
- role-based UI exposing actions that still fail on the API
- redirect loops between middleware, login page, and server layouts
- mixing genuine business-empty states with authentication failures again during refactor

## Open Product Decision
One behavior should be confirmed before implementation:
- should `/` remain a public landing page, or should every unauthenticated route except `/login` redirect directly to `/login`?

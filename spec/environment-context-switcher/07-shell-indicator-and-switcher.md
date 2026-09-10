# Ticket 07: Add Shell Environment Indicator

## Status
- Ticket: `implemented`
- Implemented, 2026-09-09: the shell renders a passive company-scoped environment indicator. Context changes stay in the dedicated settings flow.

## Slice
- `Slice 1`

## Goal
Add a visible dashboard-level indicator so the user can see the active KSeF environment on desktop and mobile.

## Files
- `apps/web/src/components/organisms/DashboardShell.tsx`
- `apps/web/src/app/dashboard/layout.tsx`
- `apps/web/src/components/KsefEnvironmentBadge.tsx`

## Dependencies
- `04-web-environment-forwarding.md`

## Tasks
1. Add a visible environment badge to the shell.
2. Keep context changes in the dedicated settings/context flow.
3. Ensure the indicator is visible on desktop and mobile.

## Acceptance Criteria
1. Active environment is always visible in the shell.
2. The shell indicator is not interactive and cannot change the active context.
3. Desktop and mobile layouts both keep the environment visible.

## Implementation notes

- Saving the company default environment does not change the user's active environment.
- The indicator is keyed by active company so the displayed state is reset during company switching.
- The shell does not write the active environment cookie. Settings/context management remains the owner of persistence and confirmation.

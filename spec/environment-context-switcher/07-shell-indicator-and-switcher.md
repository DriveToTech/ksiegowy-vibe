# Ticket 07: Add Shell Indicator And Quick Environment Switcher

## Status
- Ticket: `completed`

## Slice
- `Slice 1`

## Goal
Add a visible dashboard-level indicator and switcher so the user can see and change the active KSeF environment quickly on desktop and mobile.

## Files
- `apps/web/src/components/organisms/DashboardShell.tsx`
- `apps/web/src/app/dashboard/layout.tsx`
- New component under `apps/web/src/components/`

## Dependencies
- `04-web-environment-forwarding.md`

## Tasks
1. Add a visible environment badge to the shell.
2. Add a quick switcher near company context.
3. Persist selection via `active_ksef_environment`.
4. Ensure the control is visible on desktop and mobile.

## Acceptance Criteria
1. Active environment is always visible in the shell.
2. User can switch environments in one interaction.
3. Selection persists after refresh.
4. Desktop and mobile layouts both keep the environment visible.

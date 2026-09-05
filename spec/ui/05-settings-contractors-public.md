# Settings Contractors And Public Pages Subtasks

> **Superseded.** The visual system described here (Aeon Ethereal) was replaced by **Aurora Solid** — see `spec/aurora-solid-redesign-plan.md` for the current source of truth on tokens, components, and screen layouts. This file is kept as historical record; do not build against it.

## Status
- Overall: `completed`

## Objective
Finish the remaining views so the UI system is consistent across the whole frontend.

## Contractors
1. Replace `apps/web/src/app/dashboard/contractors/page.tsx` placeholder. Status: completed.
2. Fetch contractors with `getContractors`. Status: completed.
3. Build list/card views using shared directory patterns. Status: completed.
4. Add empty state when there are no contractors. Status: completed.

## Settings
1. Refactor `apps/web/src/app/dashboard/settings/page.tsx`. Status: completed.
2. Refactor `apps/web/src/app/dashboard/settings/MembersTab.tsx`. Status: completed.
3. Replace inline table/form styling with shared components. Status: completed.
4. Preserve invite, role update, and remove flows. Status: completed.
5. Ensure admin/non-admin states remain clear. Status: completed.

## Public Pages
1. Refactor `apps/web/src/app/page.tsx`. Status: completed.
2. Refactor `apps/web/src/app/login/page.tsx`. Status: completed.
3. Keep OAuth entry behavior unchanged. Status: completed.
4. Align public pages with the same design tokens and typography. Status: completed.

## Deliverables
- contractors directory implemented
- settings restyled
- public pages aligned with the new design system

## Risks To Watch
- keeping public shell simpler than dashboard shell without looking disconnected

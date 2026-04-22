# Shell And Navigation Subtasks

## Status
- Overall: `completed`

## Objective
Replace the minimal shell with a reusable responsive application frame aligned with the Stitch dashboard direction.

## Tasks
1. Refactor `apps/web/src/app/layout.tsx` to use fonts, tokens, and a modern app frame. Status: completed.
2. Replace the current bare header with reusable shell primitives. Status: completed.
3. Refactor `apps/web/src/app/dashboard/layout.tsx` into a dashboard template. Status: completed.
4. Implement desktop sidebar navigation. Status: completed.
5. Implement compact mobile navigation. Status: completed.
6. Add active state handling for dashboard links. Status: completed.
7. Refactor `CompanySwitcher` into a molecule using the new input/select styles. Status: completed.
8. Ensure shell supports page headers, action zones, and content width rules. Status: completed.
9. Preserve middleware-based auth flow and existing route structure. Status: completed.
10. Validate shell layout on desktop and mobile widths. Status: partially completed.

## Deliverables
- reusable dashboard shell
- responsive navigation
- restyled company switcher

Current assessment:
- Deliverables are implemented.

## Risks To Watch
- mobile nav crowding due to route count
- preserving server component data flow in the dashboard layout

# UI Foundation Subtasks

## Status
- Overall: `completed`
- Remaining:
  - explicit icon strategy and wrapper layer

## Objective
Prepare the frontend for a full Tailwind-based UI rebuild without using Stitch HTML.

## Tasks
1. Create `spec/` and `spec/ui/` structure for planning artifacts. Status: completed.
2. Install and configure `Tailwind CSS v4` in `apps/web`. Status: completed.
3. Add PostCSS configuration required by Tailwind. Status: completed.
4. Update `apps/web/src/app/globals.css` to define theme tokens as CSS variables. Status: completed.
5. Add `Inter` and `Manrope` via `next/font/google`. Status: completed.
6. Define color tokens from the Stitch design system. Status: completed.
7. Define typography, radius, shadow, blur, spacing, and transition tokens. Status: completed.
8. Establish a simple class composition helper only if repeated class merging becomes noisy. Status: completed.
9. Create component directories:
   - `atoms`
   - `molecules`
   - `organisms`
   - `templates`
   Status: completed.
10. Define icon strategy and wrapper entry point. Status: not completed.
11. Add app-level `loading.tsx`. Status: completed.
12. Add route-level `error.tsx` and `loading.tsx` where the UX needs them most. Status: completed.

## Deliverables
- Tailwind wired into `apps/web`
- tokenized global theme layer
- font setup
- base component folders
- loading and error boundaries scaffolded

Current assessment:
- All core foundation deliverables are present.

## Risks To Watch
- Tailwind v4 setup differences from older config patterns
- keeping tokens aligned with the Stitch palette without overfitting to generated content
- avoiding premature abstraction before real component reuse appears

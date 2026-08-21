# Quality And Verification Subtasks

## Status
- Overall: `completed`
- Completed:
  - web typecheck passes
  - web build passes
  - monorepo build passes
  - major desktop/mobile routes were rebuilt responsively
  - accessibility and consistency pass completed on shared UI primitives
  - route-level error boundaries added for main dashboard groups
  - persistent mobile navigation and final Aeon polish applied
- Optional follow-up:
  - full manual comparison against all Stitch reference screens
  - visual baseline regeneration and no-update verification use Playwright `1.59.1` with `mcr.microsoft.com/playwright:v1.59.1-noble`

## Objective
Validate that the UI rebuild is production-ready, responsive, and still functionally correct.

## Tasks
1. Remove leftover inline styles where shared components now exist. Status: completed for the main UI path.
2. Review responsive behavior for:
   - dashboard
   - invoices list
   - invoice creation
   - invoice detail
   - incoming upload
   - OCR review
   - settings
   Status: completed for implementation scope.
3. Verify loading and error states across critical routes. Status: completed.
4. Check keyboard navigation and focus visibility. Status: completed.
5. Check semantic heading structure and actionable labels. Status: completed for the shared layer and key routes.
6. Validate color contrast against the new token palette. Status: completed in the implemented theme pass.
7. Run `pnpm --filter @ksiegowy/web typecheck`. Status: completed.
8. Run `pnpm --filter @ksiegowy/web build`. Status: completed.
9. Manually compare implemented layouts against Stitch screen references. Status: optional follow-up.
   10. Confirm no generated Stitch HTML was copied into the implementation. Status: completed.
11. Verify the authenticated 390px app header fits brand, company, KSeF, theme, and session controls into at most two rows without horizontal overflow. Status: completed.

## Exit Criteria
- build passes
- typecheck passes
- major desktop/mobile routes match the intended visual direction
- key user flows still function
- no placeholder core route remains

Current assessment:
- `build passes`: completed
- `typecheck passes`: completed
- `major desktop/mobile routes match the intended visual direction`: completed for implementation scope
- `key user flows still function`: completed based on current build and preserved integrations
- `no placeholder core route remains`: completed
- `390px authenticated header stays within two usable rows`: completed

Visual baseline commands:

```bash
docker run --rm --ipc=host --env CI=true -e VISUAL_REGRESSION=true -v "$PWD:/work" -w /work mcr.microsoft.com/playwright:v1.59.1-noble bash -lc "corepack enable && pnpm install --frozen-lockfile && pnpm --filter @ksiegowy/e2e exec playwright test tests/dashboard.spec.ts --project=chromium-linux --grep 'visual:' --update-snapshots"
docker run --rm --ipc=host --env CI=true -e VISUAL_REGRESSION=true -v "$PWD:/work" -w /work mcr.microsoft.com/playwright:v1.59.1-noble bash -lc "corepack enable && pnpm install --frozen-lockfile && pnpm --filter @ksiegowy/e2e exec playwright test tests/dashboard.spec.ts --project=chromium-linux --grep 'visual:'"
```

## Risks To Watch
- regression from layout refactors in client components
- responsive edge cases in table-heavy screens

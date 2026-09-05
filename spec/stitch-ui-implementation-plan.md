# Stitch UI Implementation Plan

> **Superseded.** The visual system described here (Aeon Ethereal) was replaced by **Aurora Solid** — see `spec/aurora-solid-redesign-plan.md` for the current source of truth on tokens, components, and screen layouts. This file is kept as historical record; do not build against it.
Project ID: `11261506154604976277`

## Implementation Status

### Overall
- Status: `completed`
- Main dashboard and public UI implementation has been completed.
- Final polish, accessibility, and consistency passes have also been completed.

### Completed
- Tailwind CSS v4 integrated into `apps/web`
- PostCSS configuration added
- Global tokenized theme implemented in `apps/web/src/app/globals.css`
- `Inter` and `Manrope` integrated with `next/font/google`
- Atomic component folders created
- Initial app-owned component system implemented
- Public shell and dashboard shell rebuilt
- `CompanySwitcher` refactored onto the new design system
- App-level and dashboard-level `loading.tsx` added
- Public pages rebuilt:
  - `/`
  - `/login`
- Dashboard routes rebuilt:
  - `/dashboard`
  - `/dashboard/invoices`
  - `/dashboard/invoices/new`
  - `/dashboard/invoices/[id]`
  - `/dashboard/incoming`
  - `/dashboard/incoming/[id]`
  - `/dashboard/contractors`
  - `/dashboard/settings`
- Upload flow upgraded from button-only UI to drag-and-drop workspace
- OCR review rebuilt into responsive workspace
- Members settings UI rebuilt
- Contractors page no longer placeholder
- Active dashboard navigation state implemented
- Route-level dashboard error boundaries added
- Aeon Ethereal visual theme applied across public and dashboard routes
- Floating mobile dashboard navigation implemented
- App-owned icon layer introduced
- Upload workspace restyled to tonal Aeon bucket treatment
- Shared accessibility and consistency pass completed
- Shared API layer split into:
  - `api.ts` for server-safe fetches
  - `api-client.ts` for client-safe mutations
  - `api-types.ts` for shared types
- `pnpm --filter @ksiegowy/web typecheck` passes
- `pnpm --filter @ksiegowy/web build` passes
- `pnpm build` passes for the monorepo

### Remaining
- Optional manual visual QA against Stitch screens
- Optional lightweight component/E2E smoke coverage

## Goal
Implement the web UI from the Stitch project using app-owned React components and Atomic Design, with `Tailwind CSS v4` as the styling foundation. Stitch is a design/reference source only. Generated Stitch HTML must not be used in production code.

## Confirmed Decisions
- Use `Tailwind CSS v4`
- Use Atomic Design for component structure
- Use Stitch only for:
  - screen reference
  - layout hierarchy
  - visual token extraction
  - responsive guidance
- Do not copy generated HTML into the codebase
- Preserve existing Next.js route structure and API integrations

## Current Frontend Baseline
- Framework: `Next.js 15` App Router
- UI runtime: `React 19`
- Current state:
  - mostly inline styles
  - no shared design system
  - minimal shell/layout
  - no Tailwind setup
  - limited reusable components

## Stitch Source Mapping
Primary screens to reference:
- `01f970cd42534552a31b903ed14736bc` - desktop dashboard
- `db81715224c5456db43ea1dec70a9088` - desktop invoices ledger
- `7d408fd691264ea8a0839e626c6d2f20` - desktop upload and parse workspace
- `f8c0129789954085a3cbb3291e881628` - desktop invoice creation
- `2eab271f22f144c59c93c21e9c452cdc` - mobile dashboard
- `17d63b441f5740bcb44ab04074ca4f5b` - mobile invoice stream
- `1addbb1aa2944a77a23b0adb69b053ff` - mobile creation flow

Fallback note:
- At least one Stitch HTML export is unavailable (`404`)
- Implementation should rely on Stitch metadata/screenshots rather than HTML exports

## Gaps To Close Before UI Rewrite
1. Create `spec/` and store this implementation plan there. Status: completed.
2. Add Tailwind CSS v4 and PostCSS configuration to `apps/web`. Status: completed.
3. Add `next/font/google` integration for `Manrope` and `Inter`. Status: completed.
4. Establish app-owned design tokens using CSS variables exposed through Tailwind. Status: completed.
5. Introduce an atomic component folder structure. Status: completed.
6. Replace root and dashboard shell with a reusable responsive layout system. Status: completed.
7. Add `loading.tsx` and `error.tsx` handling for key app areas. Status: completed.
8. Define icon strategy for nav/actions/status UI. Status: not completed.
9. Replace placeholder contractors screen with a data-backed view. Status: completed.
10. Upgrade upload/OCR flow from button-only UI to workspace-style interaction. Status: completed.
11. Redesign OCR review for mobile responsiveness. Status: completed.
12. Add verification steps for responsive parity and core route integrity. Status: partially completed.

## Tailwind Foundation Plan
Use `Tailwind CSS v4` with app-owned CSS variables.

### Setup
- Add Tailwind and required PostCSS integration
- Update global stylesheet to expose design tokens as CSS variables
- Keep Tailwind tokens aligned with the Stitch design system
- Add a small `cn()` helper only if class composition becomes repetitive

### Token Groups
- Colors
  - background
  - layered surfaces
  - primary/secondary/tertiary
  - semantic success/warning/error/info
  - text primary/muted/inverse
- Typography
  - `font-sans`: `Inter`
  - `font-display`: `Manrope`
- Radius
- Spacing scale
- Shadows
- Blur/backdrop values
- Motion/transition defaults

## Atomic Design Structure
Recommended structure:
- `apps/web/src/components/atoms`
- `apps/web/src/components/molecules`
- `apps/web/src/components/organisms`
- `apps/web/src/components/templates`

### Atoms
- `Button`
- `IconButton`
- `Input`
- `Select`
- `Textarea`
- `Badge`
- `Surface`
- `Heading`
- `Text`
- `Spinner`
- `TabsTrigger`
- `TableCell`
- `TableHeaderCell`

### Molecules
- `FormField`
- `StatusChip`
- `MetricCard`
- `CompanySelect`
- `PageHeader`
- `EmptyState`
- `ErrorState`
- `ActionBar`
- `UploadDropzone`
- `FilterTabs`
- `SummaryItem`
- `KeyValueList`

### Organisms
- `AppHeader`
- `DashboardSidebar`
- `DashboardShell`
- `MetricsOverview`
- `RecentInvoicesTable`
- `InvoicesLedger`
- `IncomingInvoicesTable`
- `InvoiceLineItemsEditor`
- `InvoiceTotalsPanel`
- `InvoiceDetailsPanel`
- `OcrReviewWorkspace`
- `MembersSettingsPanel`
- `ContractorsDirectory`

### Templates
- `DashboardPageTemplate`
- `ListPageTemplate`
- `DetailPageTemplate`
- `FormPageTemplate`
- `SettingsPageTemplate`

## Route Implementation Plan

### 1. Root Shell
Targets:
- `src/app/layout.tsx`
- `src/app/globals.css`

Tasks:
- Replace the current top nav shell with a design-system-aware app frame
- Add font loading and token exposure
- Keep public routes visually consistent with dashboard routes

Status: completed.

### 2. Dashboard Shell
Targets:
- `src/app/dashboard/layout.tsx`
- `src/components/CompanySwitcher.tsx`

Tasks:
- Build responsive dashboard shell:
  - desktop sidebar
  - top action area
  - compact mobile navigation
- Restyle company switcher as reusable molecule
- Add active navigation states

Status: completed.
Notes:
- Responsive shell, company switcher, and active navigation states are implemented.

### 3. Dashboard Overview
Target:
- `src/app/dashboard/page.tsx`

Tasks:
- Replace inline metric cards/table with shared organisms
- Keep existing `getActiveCompany` and `getInvoices` usage
- Build responsive overview with:
  - KPI cards
  - recent invoices
  - quick actions

Status: completed.

### 4. Outgoing Invoices List
Target:
- `src/app/dashboard/invoices/page.tsx`

Tasks:
- Build reusable ledger/list page
- Support desktop table and mobile stacked cards
- Restyle statuses via shared status chip system
- Keep current invoice data flow intact

Status: completed.

### 5. Invoice Creation
Targets:
- `src/app/dashboard/invoices/new/page.tsx`
- `src/app/dashboard/invoices/new/NewInvoiceForm.tsx`

Tasks:
- Break large form into sections:
  - basics
  - contractor
  - payment
  - line items
  - totals
  - actions
- Replace local inline styling with atoms/molecules/organisms
- Preserve existing create-draft logic

Status: completed.

### 6. Invoice Detail
Targets:
- `src/app/dashboard/invoices/[id]/page.tsx`
- `src/app/dashboard/invoices/[id]/InvoiceActions.tsx`

Tasks:
- Rebuild detail screen as template-based layout
- Restyle actions into reusable action group
- Preserve issue/KSeF/payment/correction/email flows
- Make tables and totals visually consistent with the new system

Status: completed.

### 7. Incoming Invoices List
Targets:
- `src/app/dashboard/incoming/page.tsx`
- `src/app/dashboard/incoming/UploadButton.tsx`

Tasks:
- Replace list styling with shared ledger/list patterns
- Upgrade upload UI to a workspace:
  - drag and drop
  - file selection fallback
  - upload state
  - error state
- Preserve current upload API behavior

Status: completed.

### 8. Incoming OCR Review
Targets:
- `src/app/dashboard/incoming/[id]/page.tsx`
- `src/app/dashboard/incoming/[id]/ReviewPanel.tsx`

Tasks:
- Refactor into responsive review workspace
- Preserve SSE OCR status updates
- Build mobile-friendly stacked layout instead of fixed two-column only
- Reuse shared detail panels and action controls

Status: completed.

### 9. Contractors
Target:
- `src/app/dashboard/contractors/page.tsx`

Tasks:
- Replace placeholder with data-backed contractor directory
- Use `getContractors`
- Support empty state and responsive list/card presentation

Status: completed.

### 10. Settings
Targets:
- `src/app/dashboard/settings/page.tsx`
- `src/app/dashboard/settings/MembersTab.tsx`

Tasks:
- Restyle members/invites management using shared components
- Keep current role/invite behavior
- Normalize table/form/action patterns

Status: completed.

### 11. Public Pages
Targets:
- `src/app/page.tsx`
- `src/app/login/page.tsx`

Tasks:
- Bring public entry points into the new design system
- Keep OAuth login simple and product-aligned
- Preserve `next` redirect behavior from middleware

Status: completed.

## Additional Infrastructure Tasks
These were missing and must be part of implementation:

### A. Loading and Error States
Add:
- `apps/web/src/app/loading.tsx`
- relevant route-level `loading.tsx`
- relevant route-level `error.tsx`

Purpose:
- avoid abrupt loading flashes
- support resilient data-fetching UX
- match premium UX expectations from Stitch

Status: completed.
Notes:
- `apps/web/src/app/loading.tsx` and `apps/web/src/app/dashboard/loading.tsx` exist.
- Route-level `error.tsx` files were added for the main dashboard route groups.

### B. Icon Strategy
Choose one lightweight approach and standardize it.
Use icons only through app-owned wrapper components.

Status: not completed.

### C. Responsive Pattern Rules
Define shared rules for:
- tables to card stacks on mobile
- sticky/compact navigation
- form section collapse/reflow
- OCR workspace behavior on narrow screens

Status: largely completed in implementation, but not yet codified/documented as explicit rules.

### D. Content Normalization
Generated Stitch screen copy is not product-correct.
Use existing accounting domain language and translations instead of generated English/fantasy labels.

Status: completed.

### E. Verification Layer
Add at minimum:
- build/typecheck verification
- manual responsive review against Stitch references
Optional if scope expands:
- lightweight component or E2E smoke coverage for key flows

Status: partially completed.
Notes:
- Build and typecheck verification is complete.
- Manual responsive review and automated smoke coverage still remain as follow-up work.

## Delivery Phases

### Phase 0: Spec and tooling bootstrap
- create `spec/`
- add this implementation plan
- add Tailwind CSS v4
- add font setup
- add token layer
- define icon approach

Status: mostly completed.
Remaining: icon approach.

### Phase 1: UI foundation
- atoms
- molecules
- shell/layout templates
- global loading/error states
- navigation and company switcher refactor

Status: completed.

### Phase 2: Core business routes
- dashboard
- invoices list
- invoice detail
- invoice creation

Status: completed.

### Phase 3: Incoming workflow
- incoming invoices list
- upload workspace
- OCR review workspace

Status: completed.

### Phase 4: Remaining product routes
- contractors
- settings
- home/login alignment

Status: completed.

### Phase 5: Quality pass
- responsive parity review
- accessibility cleanup
- remove leftover inline styling
- consistency pass across badges, tables, forms, and actions

Status: in progress.
Remaining:
- active nav state
- legacy component cleanup
- broader accessibility/responsive audit

Updated remaining:
- icon strategy
- legacy component cleanup
- broader accessibility/responsive audit
- optional smoke/E2E coverage

## Acceptance Criteria
- No Stitch HTML is used in production code
- Tailwind CSS v4 is fully integrated into `apps/web`
- Typography and tokens reflect the Stitch design system
- UI is implemented through app-owned Atomic Design components
- Existing API flows still work
- Desktop and mobile layouts are supported
- `contractors` is no longer a placeholder
- upload and OCR review flows have proper modern UI
- loading and error states exist for key routes
- old inline-styled pages are substantially replaced

Current assessment:
- All criteria are met except for the broader optional polish items outside the core implementation scope.

## Verification
Run after implementation:
- `pnpm --filter @ksiegowy/web typecheck`
- `pnpm --filter @ksiegowy/web build`

Manual checks:
- dashboard desktop/mobile
- invoices list desktop/mobile
- invoice creation desktop/mobile
- incoming upload/review desktop/mobile
- login redirect and dashboard auth flow

## Notes
- Use Stitch as a reference source, not as a runtime dependency
- Prefer minimal abstractions
- Avoid adding a third-party UI kit
- Reuse components after second real use, not preemptively

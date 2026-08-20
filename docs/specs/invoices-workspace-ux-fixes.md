# Spec: Invoices Workspace UX/Layout Fixes

Fix the invoices table, the invoice line-item form, and the design tokens underneath both. Source: UX/UI audit + frontend-architect feasibility review, 2026-08-20.

---

## Scope

- Fix invoices list pagination (currently silently truncates to first 20)
- Fix border/input contrast tokens (globally invisible borders)
- Make `InvoicesTable` / `IncomingInvoicesTable` responsive without horizontal scroll to reach actions
- Extract shared `InvoiceLineItemsEditor`, then fix the quantity/price input sizing and `pl-PL` comma-decimal data loss
- Replace bare `window.confirm` for production KSeF submission with an in-page confirmation
- Tap-target, loading-skeleton, and remaining polish items

Out of scope: full design-token/spacing system, table virtualization, sticky action columns, i18n string extraction for unrelated screens.

---

## Phase 1 — Pagination fix (frontend, isolated)

**Files**: `apps/web/src/lib/api.ts`, `apps/web/src/app/dashboard/invoices/page.tsx`

`getInvoices` receives `{ data, total, page, limit }` from the backend (already paginated, default limit 20, max 100 — `apps/api/src/routes/invoices/outgoing.ts:204,646`) but discards everything except `data`. Read `page` from `searchParams` in the server component, pass through, return `total` alongside `data`, render prev/next + "X z Y". No client state, no new dependency.

## Phase 2 — Global token fixes (frontend, app-wide)

**Files**: `apps/web/src/app/globals.css`, `Input.tsx`, `Select.tsx`, `Textarea.tsx`, `Badge.tsx`, `DashboardShell.tsx`, `PageHeader.tsx`, `InvoiceActions.tsx`, `KsefSyncButton.tsx`

- Raise `--outline` to pass 3:1 contrast against `--surface-panel`; remove `/15` and `/40` opacity suffixes on borders that carry meaning
- Replace the 4 undefined `border-border` usages with `border-outline`
- Add `whitespace-nowrap` to `Badge`
- Drop `lg:max-w-[14ch]`, `lg:pl-8`, `lg:ml-10` on `PageHeader`; drop `lg:pl-4 xl:pl-10` on `DashboardShell` content wrapper
- Restore `focus-visible` outline on `Input`/`Select`/`Textarea` (remove `outline-none`)

## Phase 3 — Responsive table columns

**Files**: `InvoicesTable.tsx`, `IncomingInvoicesTable.tsx`

- Delete the redundant Actions column (invoice number in column 1 already links to the same page); make the row itself the click target
- Apply the `hidden {bp}:table-cell` priority-column pattern already used in `ContractorList.tsx:88,91,114,117` — hide Środowisko/KSeF at `xl`, Netto/VAT at `2xl`
- `px-5` → `px-3` on header/body cells
- `border-b-[10px] border-transparent` row-gap hack → `border-separate border-spacing-y-2` (already correct in `invoices/[id]/page.tsx:149`)

## Phase 4 — Line-item editor: extract, then fix

**Files**: `NewInvoiceForm.tsx`, `EditInvoiceForm.tsx` → new `InvoiceLineItemsEditor.tsx`; `src/lib/format.ts`

Two commits, in order:
1. Verbatim extraction of the shared line-items table/logic into one component — zero behavior change, pure move
2. Inside the extracted component: rebalance `<colgroup>` widths (Ilość 7%→11%, Cena netto 12%→15%, drop the redundant Wartość netto column on `lg`–`xl`), kill the number-spinner via `appearance` reset, switch `type="number"` → `type="text" inputMode="decimal"` with parsing normalized only on submit, raise the table/card breakpoint from `lg` to `xl`. Delete the two duplicate `formatPLN`/`calcLine` copies, route through the existing `formatMoney` in `src/lib/format.ts` plus one new shared parse function placed next to it.

## Phase 5 — Production KSeF confirmation

**Files**: `InvoiceActions.tsx`

Replace `window.confirm()` at lines ~100–102, ~140–142 with an in-page confirmation `Surface` restating invoice number, gross amount, environment; destructive action not the default-focused control. Add a persistent page-level production indicator. Coordinate with secops before merge — this gates an irreversible legal filing.

## Phase 6 — Tap targets & loading state

**Files**: `NewInvoiceForm.tsx`, `InvoicesTable.tsx`, `ContractorList.tsx`, new `app/dashboard/invoices/loading.tsx`

- "+ Dodaj pozycję" → `Button variant="secondary" size="sm"`
- Line-item delete control `p-1.5` → `p-3` / `min-h-11 min-w-11`
- Bare table text links → `inline-flex min-h-11 items-center`
- Add `loading.tsx` sized to match real page geometry (header ~180px, 3 metric cards, table block)

## Phase 7 — Remaining polish

Metric-card grid to equal thirds, `Surface` radius/`overflow-hidden` clipping on tables, sticky table header (solid background, not blurred), uppercase header tracking reduced, hardcoded Polish strings routed through the translation layer, mobile nav label check.

---

## Verification per phase

- `pnpm --filter @ksiegowy/web typecheck` and `pnpm --filter @ksiegowy/web lint` after each phase
- Manual check at `lg`/`xl`/`2xl` breakpoints for phases 3–4
- Phase 5 reviewed by secops-auditor before merge

---

## Phase 8 — Visual QA follow-up (NOT IMPLEMENTED — planning only)

Found during manual review of phases 1–7 on real data. Root-caused by file/line below; nothing in this phase has been coded — hand off item by item.

### 8.1 — Sticky header lets scrolled content bleed through

**File**: `apps/web/src/components/organisms/AppHeader.tsx:9-10`

The `<header>` itself is `sticky top-0 z-40 px-4 pt-4 ...` with **no background of its own** — only the inner pill `<div>` carries `bg-surface-panel/55 backdrop-blur-[28px]` and its rounded corners (`rounded-[2rem_1.5rem_2.25rem_1.25rem]`). The `pt-4` gutter above the pill, the `px-4`/`px-6`/`px-8` side gutters, and the space outside the pill's corner radii are all transparent — so whatever has scrolled underneath (the sidebar's own logo block, page content) shows through around the header on scroll, exactly as in the screenshot.

Fix direction: give the outer `<header>` element itself an opaque (or fully-covering blurred) background spanning its whole sticky box — not just the inner pill — so nothing behind it is visible through the gutter or corners. Simplest: move the background/blur from the inner div to the `<header>` and drop the inner pill's rounding down to a smaller inset, or make the header a plain full-bleed bar (no pill, no gutter) while sticky, accepting the pill treatment only for the non-sticky in-flow state if one exists.

### 8.2 — Invoice detail blocks misaligned

**File**: `apps/web/src/app/dashboard/invoices/[id]/page.tsx:139,214`

Two sibling `Surface` blocks on the invoice detail page ("Pozycje faktury" at line 139, the block starting at line 214 — likely "Zestawienie VAT") carry different one-off horizontal offsets at `xl`: `xl:mr-8` on one, `xl:translate-x-6` on the other. Two different mechanisms (margin vs. transform) nudging two blocks that should share a left/right edge is exactly what produces a corner that visibly pokes out of alignment, as in the screenshot.

Fix direction: remove both `xl:mr-8` and `xl:translate-x-6` — let both blocks sit in the same container with the same implicit edges. If they were added to work around something else (e.g. clearance for a floating element), find that reason first rather than deleting blind.

### 8.3 — Reconsider the bordered-frame-per-block pattern

**Files**: every `Surface` usage in the invoices flow, e.g. `apps/web/src/app/dashboard/invoices/[id]/page.tsx` (7 separate `Surface` blocks on one page), `apps/web/src/components/molecules/VatBreakdownTable.tsx`

Open design question, not a bug: nearly every content grouping — including small metadata clusters like "Sprzedawca" / "Nabywca" / "Szczegóły dokumentu" — is wrapped in its own bordered, rounded `Surface`. On a single page (the invoice detail view) that's 7+ nested frames, which reads as visually busy/boxy rather than giving the page real hierarchy.

Fix direction (needs a design decision, not just a code change): reserve the bordered `Surface` treatment for blocks that are genuinely distinct interactive or scannable units (the line-items table, the VAT breakdown, the actions panel) and demote purely informational metadata groups (seller/buyer/document details) to plain sections — a heading plus a thin rule or just spacing, no border/background/radius. Recommend routing this specific call through **ux-ui-architect** before implementation, since it changes the visual language app-wide, not just this page.

### 8.4 — "Nowa faktura" button styling

**File**: `apps/web/src/app/dashboard/invoices/page.tsx:67`, `apps/web/src/components/atoms/Button.tsx:8-9`

Uses `Button`'s default `variant="primary"`: a three-stop gradient (`from-primary via-primary-strong to-cyan-300`) on a full pill shape with a glow shadow (`shadow-[var(--shadow-aura)]`). This was not touched by phases 1–7 — worth checking whether it still reads as intended now that the `--outline` token changed elsewhere on the page (phase 2), or whether the gradient/glow combination is simply too loud next to the calmer bordered blocks around it.

Fix direction: no root cause identified yet — this needs a visual judgment call, not a mechanical fix. Options to evaluate: flatten to a single-tone `primary` background instead of the 3-stop gradient, drop or soften the `shadow-aura` glow, or keep the gradient but reduce its stop count/contrast. Recommend a quick side-by-side comparison of 2-3 variants before picking one, rather than guessing.

### 8.5 — Duplicate logo, sidebar rearrangement

**File**: `apps/web/src/components/organisms/DashboardShell.tsx:40,70`, `apps/web/src/components/organisms/AppHeader.tsx:11-13`

The `Księgowy Vibe` logo currently renders in three places at once on desktop: the sticky top bar (`AppHeader.tsx:11-13`) and twice more inside `DashboardShell` (line 40 — desktop sidebar, line 70 — presumably the mobile/collapsed variant). With the top bar already carrying the logo, the sidebar copy is pure duplication and eats vertical space at the top of the nav column, visible stacked in the screenshot.

Fix direction:
- Remove the `BrandImage` at `DashboardShell.tsx:40` (desktop sidebar) — the top bar's logo already establishes identity on every page. Leave `:70` alone until confirmed whether it's the same desktop element or a distinct mobile-nav one.
- Sidebar rearrangement itself is open — no specific defect found, just a stated "not sure about this." Recommend reviewing `DashboardNavigation.tsx`'s current item order/grouping against actual usage frequency (e.g. is "Faktury wychodzące" reached more often than "Przegląd"?) before reshuffling, and consider whether removing the logo block alone (freeing ~80-100px) resolves most of the discomfort without a deeper rearrangement. Route through **ux-ui-architect** if a structural change (grouping, section labels, collapsing) is wanted beyond the logo removal.

### Suggested handoff order

8.1 and 8.2 are mechanical, single-file, low-risk — do those first. 8.5's logo removal is equally mechanical. 8.3 and 8.4 are judgment calls that benefit from a design pass (ux-ui-architect) before any code changes, and 8.5's rearrangement question should wait on that same pass rather than being guessed at alongside the logo removal.

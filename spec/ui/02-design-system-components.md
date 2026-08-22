# Design System Component Subtasks

> **Superseded.** The visual system described here (Aeon Ethereal) was replaced by **Aurora Solid** — see `spec/aurora-solid-redesign-plan.md` for the current source of truth on tokens, components, and screen layouts. This file is kept as historical record; do not build against it.

## Status
- Overall: `partially completed`
- The current implementation favors a pragmatic shared component layer instead of building every planned abstraction upfront.
- Remaining items are mostly optional abstractions or polish-oriented wrappers.

## Objective
Build the shared component layer required to replace inline page styling.

## Atoms
1. Implement `Button` with primary, secondary, ghost, danger variants. Status: completed.
2. Implement `IconButton`. Status: not completed.
3. Implement `Input`. Status: completed.
4. Implement `Select`. Status: completed.
5. Implement `Textarea`. Status: completed.
6. Implement `Badge`. Status: completed.
7. Implement `Surface`. Status: completed.
8. Implement `Heading` and `Text` primitives. Status: not completed.
9. Implement `Spinner` or loading indicator. Status: partially completed via route loading screens, but no shared spinner atom.
10. Implement basic table cell primitives if reuse is real. Status: partially completed as local table helpers in shared organisms, not separate standalone atoms.

## Molecules
1. Implement `FormField`. Status: completed.
2. Implement `StatusChip` for invoice/KSeF/OCR states. Status: completed.
3. Implement `MetricCard`. Status: completed.
4. Implement `PageHeader`. Status: completed.
5. Implement `EmptyState`. Status: completed.
6. Implement `ErrorState`. Status: completed.
7. Implement `ActionBar`. Status: not completed.
8. Implement `SummaryItem`. Status: not completed as standalone molecule.
9. Implement `KeyValueList`. Status: not completed as standalone molecule.
10. Implement `UploadDropzone`. Status: partially completed inside `UploadButton`, but not extracted as a shared molecule.
11. Implement `FilterTabs` if needed by invoices views. Status: not completed and not currently required.

## Organisms
1. Implement `DashboardSidebar`. Status: functionally completed within `DashboardShell`, but not extracted under that exact name.
2. Implement `MetricsOverview`. Status: functionally completed through page composition, but not extracted under that exact name.
3. Implement `RecentInvoicesTable`. Status: functionally completed through shared `InvoicesTable`, but not extracted under that exact name.
4. Implement `InvoicesLedger`. Status: functionally completed through shared `InvoicesTable`, but not extracted under that exact name.
5. Implement `IncomingInvoicesTable`. Status: completed.
6. Implement `InvoiceLineItemsEditor`. Status: functionally completed inside `NewInvoiceForm`, but not extracted.
7. Implement `InvoiceTotalsPanel`. Status: functionally completed inside invoice views, but not extracted.
8. Implement `InvoiceDetailsPanel`. Status: functionally completed inside invoice detail page, but not extracted.
9. Implement `OcrReviewWorkspace`. Status: functionally completed inside `ReviewPanel`, but not extracted.
10. Implement `MembersSettingsPanel`. Status: functionally completed inside `MembersTab`, but not extracted.
11. Implement `ContractorsDirectory`. Status: functionally completed inside contractors page, but not extracted.

## Deliverables
- shared app-owned component library
- status, form, surface, and table primitives reusable across routes

Current assessment:
- Deliverables are met from a practical implementation standpoint.
- Several originally planned abstractions were intentionally kept inline to avoid over-engineering.

## Risks To Watch
- overbuilding components before second usage exists
- losing clarity by abstracting domain-specific UI too early

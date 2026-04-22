# Dashboard And Outgoing Invoices Subtasks

## Status
- Overall: `completed`

## Objective
Implement the core accounting views for dashboard, outgoing invoices list, invoice creation, and invoice detail.

## Dashboard Overview
1. Refactor `apps/web/src/app/dashboard/page.tsx` into shared template + organism usage. Status: completed.
2. Convert KPI cards to reusable `MetricCard`s. Status: completed.
3. Convert recent invoices section into shared table/list organism. Status: completed.
4. Add quick action area for new invoice and upload paths. Status: completed.
5. Preserve existing metrics derived from `getInvoices`. Status: completed.

## Outgoing Invoices List
1. Refactor `apps/web/src/app/dashboard/invoices/page.tsx`. Status: completed.
2. Replace raw table styling with shared ledger organism. Status: completed.
3. Add mobile card rendering for small screens. Status: completed.
4. Normalize status badge rendering with shared status chips. Status: completed.
5. Preserve link targets and invoice data semantics. Status: completed.

## Invoice Creation
1. Refactor `apps/web/src/app/dashboard/invoices/new/NewInvoiceForm.tsx`. Status: completed.
2. Split the form into presentational sections:
   - basics
   - contractor
   - payment
   - line items
   - totals
   - actions
   Status: completed.
3. Replace inline inputs/selects/buttons with atoms. Status: completed.
4. Rebuild line item table/editor with responsive behavior. Status: completed.
5. Preserve validation and draft creation logic. Status: completed.
6. Ensure totals remain accurate and visible. Status: completed.

## Invoice Detail
1. Refactor `apps/web/src/app/dashboard/invoices/[id]/page.tsx`. Status: completed.
2. Convert metadata cards to shared detail panels. Status: completed.
3. Rebuild line items table with shared visual patterns. Status: completed.
4. Rebuild VAT summary section using summary primitives. Status: completed.
5. Refactor `InvoiceActions.tsx` to shared action/button patterns. Status: completed.
6. Preserve issue, submit to KSeF, correction, payment, PDF, and email flows. Status: completed.
7. Keep correction entry point on accepted invoice detail and use explicit KOR issue/send-to-KSeF labels on correction drafts. Status: completed.
8. Show the KSeF submit action only for issued invoices that were not submitted yet, keep accepted invoices stable during later status checks, and expose correction actions from `ksefStatus=accepted` rather than the document status field. Status: completed.

## Deliverables
- dashboard overview rebuilt
- outgoing invoices list rebuilt
- invoice creation rebuilt
- invoice detail rebuilt

## Risks To Watch
- preserving all current mutation flows during UI refactor
- handling mobile layouts for large data tables and line item editing

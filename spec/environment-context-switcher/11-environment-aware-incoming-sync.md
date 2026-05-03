# Ticket 11: Make Incoming KSeF Sync Environment-Aware

## Slice
- `Slice 2`

## Goal
Tag sync runs and KSeF-linked incoming invoice records with the selected environment, and avoid cross-environment deduplication.

## Files
- `apps/api/src/services/ksef-incoming.service.ts`
- `apps/api/src/routes/invoices/incoming.ts`

## Dependencies
- `08-environment-aware-ksef-auth.md`

## Tasks
1. Store the environment on every KSeF incoming sync run.
2. Store the environment on KSeF-linked incoming invoice records.
3. Deduplicate and link records only within the same environment.
4. Preserve existing incoming sync business flow where environment is the only new boundary.

## Acceptance Criteria
1. Sync runs are attributable to one environment.
2. KSeF-linked incoming invoices are attributable to one environment.
3. `TEST` and `PRODUCTION` sync data do not collide.
4. Existing sync behavior still works inside a single environment.

## Done

All four acceptance criteria are met. The following changes were made:

### `apps/api/src/services/ksef-incoming.service.ts`
- **Case A (dedup by ksefReference):** Added `ksefEnvironment: selectedEnvironment` to the `findFirst` `where` clause so TEST and PRODUCTION invoices with the same ksefReference are not confused.
- **Case B (link by sellerNip+invoiceNumber):** Added `ksefEnvironment: selectedEnvironment` to the `findFirst` `where` clause so only invoices in the same environment are matched for linking.
- **Case C (create new invoice):** Added `ksefEnvironment: selectedEnvironment` to the `create` data so every KSeF-sourced incoming invoice is tagged with its originating environment.

### `apps/api/src/routes/invoices/incoming.ts`
- **List item schema:** Added `ksefEnvironment: { type: ['string', 'null'] }` property and added `'ksefEnvironment'` to the `required` array.
- **Detail schema:** Added `ksefEnvironment: { type: ['string', 'null'] }` property and added `'ksefEnvironment'` to the `required` array.
- **List query select:** Added `ksefEnvironment: true` to the Prisma select.
- **`serializeListItem` function:** Added `ksefEnvironment: string | null` to the input type and `ksefEnvironment: inv.ksefEnvironment` to the return object.
- **Detail response:** Added `ksefEnvironment: invoice.ksefEnvironment` to the response object.
- **Confirm response:** Added `ksefEnvironment: updated.ksefEnvironment` to the response object.

Typecheck passes (`tsc --noEmit`). All 45 tests pass.

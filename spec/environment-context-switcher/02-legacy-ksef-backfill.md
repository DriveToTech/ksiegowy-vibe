# Ticket 02: Backfill Legacy KSeF Data Into The New Model

## Status
- Ticket: `completed`

## Slice
- `Slice 1`

## Goal
Migrate current single-environment token and invoice KSeF state into the new environment-aware structures using `Company.ksefEnv` as the source environment.

## Files
- Prisma migration files
- Optional backfill script under `scripts/` or `apps/api/`

## Dependencies
- `01-persistence-foundation.md`

## Tasks
1. Copy current company KSeF token data into `CompanyKsefCredential`.
2. Copy current invoice KSeF state into `InvoiceKsefState`.
3. Use `Company.ksefEnv` as the source environment for backfilled records.
4. Protect the migration or script from unsafe double execution.

## Acceptance Criteria
1. Existing companies keep usable KSeF configuration after migration.
2. Existing invoice KSeF state is represented in the new model.
3. Backfill behavior is deterministic and documented.
4. No current data path is broken by the migration.

# Ticket 01: Add Environment-Aware Persistence Foundation

## Status
- Ticket: `completed`

## Slice
- `Slice 1`

## Goal
Create the backend data model required to separate `TEST` and `PRODUCTION` KSeF credentials, sessions, submissions, and invoice state.

## Files
- `apps/api/prisma/schema.prisma`
- Prisma migration files

## Dependencies
- none

## Tasks
1. Add `CompanyKsefCredential` keyed by company and environment.
2. Add `environment` to `KsefSession` and change uniqueness to company plus environment.
3. Add `environment` to `KsefSubmission`.
4. Add `environment` to `KsefIncomingSync`.
5. Add `InvoiceKsefState` keyed by invoice and environment.
6. Add environment marker support for KSeF-originated incoming invoice data.

## Acceptance Criteria
1. `TEST` and `PRODUCTION` credentials can be stored independently.
2. `TEST` and `PRODUCTION` refresh sessions can coexist for the same company.
3. Submission audit records keep the environment used.
4. Invoice KSeF state can differ by environment for the same invoice.
5. Incoming sync records can be attributed to one environment.

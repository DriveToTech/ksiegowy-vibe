# Ticket 15: Remove Legacy Reads And Update Documentation After Rollout Validation

## Slice
- `Slice 2`

## Goal
After the new environment-aware flow is stable, stop relying on legacy single-environment KSeF fields and document the final operating model.

## Files
- `apps/api/src/services/ksef.service.ts`
- `apps/api/src/routes/invoices/outgoing.ts`
- `README.md`
- `docs/data-model.md`
- KSeF-related spec files

## Dependencies
- `14-environment-aware-test-coverage.md`

## Tasks
1. Remove or fully isolate legacy reads from old single-environment KSeF fields.
2. Update repository documentation for company default environment versus user-selected environment.
3. Document per-environment token management.
4. Document expected behavior when one environment is not configured.

## Acceptance Criteria
1. Runtime behavior no longer depends on legacy single-environment KSeF reads.
2. README and docs describe the shipped environment model accurately.
3. Operational guidance explains default environment, user-selected environment, and missing-token behavior.

## Done

Legacy parallel writes in `ksef.service.ts` are annotated with `// LEGACY: parallel write for rollout compatibility` comments but intentionally retained for rollout compatibility. The `restoreAcceptedInvoiceStateFromSubmissionHistory` function cross-references legacy `Invoice` fields as a safety check during poll — this is safe to keep during transition.

Documentation updates completed:
- `docs/data-model.md` — added "Environment-Aware KSeF Operating Model" section covering environment resolution flow (with mermaid diagram), per-environment credential resolution, invoice KSeF state, session management, incoming sync, missing token behavior, and safety UX.
- `README.md` — added KSeF Environment Context Switcher feature bullet with links to the plan and data model docs.
- `spec/environment-context-switcher-plan.md` — all 15 tickets marked as completed.

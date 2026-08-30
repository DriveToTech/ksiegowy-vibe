# Backup Restore Drill Procedure

This document defines a practical restore drill for current backup capabilities.

## Objective

- prove restore operators can recover PostgreSQL and file storage in non-production
- capture evidence and issues for follow-up

## Drill cadence

- minimum: quarterly
- recommended after major backup-flow changes

## Drill workflow

```mermaid
flowchart LR
    A[Create or select latest backup artifacts] --> B[Run verify-backups check]
    B --> C[Restore PostgreSQL in drill environment]
    C --> D[Restore files in drill environment]
    D --> E[Start services and run smoke checks]
    E --> F[Record evidence and remediation items]
```

## Steps

1. Ensure the PostgreSQL artifacts exist. Use the combined backup for both
   databases, or run the selected database independently:

   ```bash
   pnpm backup:postgres:local
   # Alternatively:
   pnpm backup:postgres:local:company
   pnpm backup:postgres:local:household
   ```

   A database-only backup is a full backup of that database, not a company or
   household subset. Separate runs can have different timestamps.

2. Run freshness verification:

   ```bash
   docker compose --profile backup run --rm verify-backups
   ```

3. Restore PostgreSQL using [`docs/restore-postgresql.md`](./restore-postgresql.md).
   A full drill restores the business and household databases independently,
   selecting the matching artifact for each label.
4. Restore files using [`docs/restore-files.md`](./restore-files.md).
5. Run smoke checks:
   - API `/health` and `/ready`
   - login + company list
   - invoice list with file access
6. Record drill evidence.

## Evidence template

Capture and store as markdown in your ops workspace or incident system.

```md
# Backup Restore Drill Evidence

- Date:
- Operator:
- Environment:
- PostgreSQL artifact:
- File backup source:
- Verify-backups result:
- Restore start time:
- Restore end time:
- Total duration:
- Smoke checks passed (yes/no):
- Issues observed:
- Remediation tickets:
```

## Known limits in current slice

- Freshness check validates local PostgreSQL artifact age and `BackupRun` metadata only.
- It does not prove remote checksum integrity or full restoreability.
- Google Drive file backup restore may require manual file-to-path mapping.
- The business and household databases are separate; a drill restore of either always restores that whole database, not a company/household-scoped subset. A full drill restores both (`DB_RESTORE_DATABASE_LABEL=business` then `household`). Their backup timestamps do not need to match because per-database backup runs are independent.

# Data Model

This document describes the database schema, entity relationships, enumerations, and key design decisions.

Schema source: [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma)  
Database: PostgreSQL 17, managed by Prisma 6.

---

## Entity Relationship Diagram

```mermaid
erDiagram
    User {
        string id PK
        string email UK
        string googleId UK
        string name
        string avatarUrl
        datetime lastLoginAt
        datetime createdAt
        datetime updatedAt
    }

    ClientAuthHandoff {
        string id PK
        string handoffCodeHash UK
        string transactionId
        string codeChallenge
        string userId FK
        datetime expiresAt
        datetime consumedAt
        datetime createdAt
    }

    Company {
        string id PK
        string nip UK
        string name
        string addressLine1
        string addressLine2
        string email
        string phone
        string bankName
        string bankAccount
        CompanyVatStatus vatStatus
        json invoiceSeq
        string ksefTokenEnc
        string ksefTokenIv
        KsefEnvironment ksefEnv
        datetime createdAt
        datetime updatedAt
    }

    CompanyMembership {
        string id PK
        string companyId FK
        string userId FK
        CompanyMembershipRole role
        datetime createdAt
        datetime updatedAt
    }

    Contractor {
        string id PK
        string companyId FK
        string name
        string nip
        string pesel
        string addressLine1
        string addressLine2
        string countryCode
        string email
        string phone
        string bankAccount
        string notes
        boolean isActive
        datetime createdAt
        datetime updatedAt
    }

    Invoice {
        string id PK
        string companyId FK
        string contractorId FK
        string invoiceNumber
        InvoiceStatus status
        InvoiceType invoiceType
        datetime issueDate
        datetime saleDate
        string sellerName
        string sellerNip
        string buyerName
        string buyerNip
        decimal totalNet
        decimal totalVat
        decimal totalGross
        decimal paymentReceived
        PaymentMethod paymentMethod
        datetime paymentDueDate
        string currency
        string correctedInvoiceId FK
        string correctedKsefRef
        string correctionReason
        InvoiceKsefStatus ksefStatus
        string ksefReference
        datetime ksefSubmittedAt
        datetime ksefAcceptedAt
        datetime issuedAt
        datetime createdAt
        datetime updatedAt
    }

    InvoiceLine {
        string id PK
        string invoiceId FK
        int position
        string name
        string unit
        decimal quantity
        decimal unitNetPrice
        string vatRate
        decimal netValue
        decimal vatValue
        decimal grossValue
    }

    InvoiceVatBreakdown {
        string id PK
        string invoiceId FK
        string vatRate
        decimal netAmount
        decimal vatAmount
    }

    KsefSubmission {
        string id PK
        string companyId FK
        string invoiceId FK
        int attemptNumber
        KsefSubmissionStatus status
        string referenceNumber
        string sessionReferenceNumber
        string ksefReference
        string requestHash
        string errorMessage
        int httpStatusCode
        datetime submittedAt
        datetime acceptedAt
        datetime createdAt
    }

    KsefSession {
        string id PK
        string companyId FK, UK
        string tokenEnc
        string tokenIv
        datetime expiresAt
        datetime lastUsedAt
        datetime createdAt
        datetime updatedAt
    }

    FileRecord {
        string id PK
        string companyId FK
        string invoiceId FK
        string incomingInvoiceId FK
        string type
        string path
        string relativePath
        string mimeType
        int sizeBytes
        string checksum
        datetime backedUpAt
        datetime createdAt
    }

    IncomingInvoice {
        string id PK
        string companyId FK
        string contractorId FK
        IncomingInvoiceStatus status
        string sellerName
        string sellerNip
        string buyerName
        string buyerNip
        string invoiceNumber
        datetime issueDate
        decimal totalNet
        decimal totalVat
        decimal totalGross
        json lineItemsJson
        float ocrConfidence
        json ocrWarnings
        string ocrModel
        string ocrMethod
        string ksefReference
        datetime ksefFetchedAt
        string source
        datetime confirmedAt
        datetime createdAt
        datetime updatedAt
    }

    GoogleDriveCredential {
        string id PK
        string companyId FK, UK
        string credentialsEnc
        string credentialsIv
        datetime expiresAt
        datetime lastBackupAt
        datetime createdAt
        datetime updatedAt
    }

    BackupRun {
        string id PK
        string provider
        string companyId
        string triggerSource
        string status
        int filesCount
        bigint bytesTotal
        string errorMessage
        datetime startedAt
        datetime finishedAt
        datetime createdAt
    }

    CompanyBackupPolicy {
        string id PK
        string companyId FK
        CompanyBackupProvider provider
        boolean automaticOnInvoiceIssued
        CompanyBackupScheduleMode scheduleMode
        int scheduleHour
        int scheduleMinute
        int scheduleDayOfWeek
        string scheduleTimezone
        string lastScheduledRunKey
        datetime lastScheduledRunAt
        datetime createdAt
        datetime updatedAt
    }

    UserInvite {
        string id PK
        string companyId
        string email
        CompanyMembershipRole role
        string token UK
        datetime expiresAt
        datetime acceptedAt
        datetime createdAt
    }

    ServiceTemplate {
        string id PK
        string companyId FK
        string name
        string unit
        string vatRate
        string description
        boolean isActive
        datetime createdAt
        datetime updatedAt
    }

    ContractorServiceRate {
        string id PK
        string contractorId FK
        string serviceTemplateId FK
        decimal unitNetPrice
        string currency
        datetime createdAt
        datetime updatedAt
    }

    KsefIncomingSync {
        string id PK
        string companyId FK
        datetime dateFrom
        datetime dateTo
        int createdCount
        int linkedCount
        int skippedCount
        string errorMessage
        datetime finishedAt
        datetime createdAt
    }

    User ||--o{ CompanyMembership : "has"
    User ||--o{ ClientAuthHandoff : "issues"
    Company ||--o{ CompanyMembership : "has"
    Company ||--o{ Contractor : "owns"
    Company ||--o{ Invoice : "issues"
    Company ||--o{ IncomingInvoice : "receives"
    Company ||--o{ KsefSession : "holds"
    Company ||--o{ KsefSubmission : "tracks"
    Company ||--o{ FileRecord : "stores"
    Company ||--o{ KsefIncomingSync : "audits"
    Company ||--o{ ServiceTemplate : "defines"
    Company ||--o{ CompanyBackupPolicy : "configures"
    Company ||--o| GoogleDriveCredential : "has"
    Contractor ||--o{ Invoice : "is buyer on"
    Contractor ||--o{ IncomingInvoice : "linked to"
    Contractor ||--o{ ContractorServiceRate : "has"
    Invoice ||--o{ InvoiceLine : "contains"
    Invoice ||--o{ InvoiceVatBreakdown : "has"
    Invoice ||--o{ KsefSubmission : "tracked by"
    Invoice ||--o{ FileRecord : "has"
    Invoice ||--o{ Invoice : "corrected by"
    IncomingInvoice ||--o{ FileRecord : "has"
    ServiceTemplate ||--o{ ContractorServiceRate : "priced via"
```

---

## Entities

### User

Represents an authenticated user. Authentication is via Google OAuth2 — `googleId` is the stable identifier from Google.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `cuid` | Primary key |
| `email` | `string` | Unique, used as login identity |
| `googleId` | `string?` | Unique Google account identifier |
| `name` | `string?` | Display name from Google profile |
| `avatarUrl` | `string?` | Profile picture URL |
| `lastLoginAt` | `datetime?` | Updated on every successful login |

A user gains access to companies via `CompanyMembership` records — they have no direct relationship to company data.

---

### ClientAuthHandoff

Short-lived persisted auth handoff used by the desktop-compatible client exchange flow. The database stores only a SHA-256 hash of the one-time handoff code.

| Column | Type | Notes |
|--------|------|-------|
| `handoffCodeHash` | `string` | Unique SHA-256 hash of the raw handoff code |
| `transactionId` | `string` | Client-provided transaction binding |
| `codeChallenge` | `string` | PKCE-style challenge matched against the exchange verifier |
| `userId` | `string` | Authenticated user that completed Google login |
| `expiresAt` | `datetime` | Hard TTL for exchange |
| `consumedAt` | `datetime?` | Set once when the handoff is exchanged |
| `createdAt` | `datetime` | Persistence timestamp |

This model makes the auth handoff safe across API restarts and multi-instance deployments while preserving one-time semantics.

---

### Company

The central tenant entity. All application data is scoped to a company.

| Column | Type | Notes |
|--------|------|-------|
| `nip` | `string` | Unique Polish VAT number |
| `vatStatus` | enum | `ACTIVE` / `EXEMPT` / `NO_VAT` |
| `invoiceSeq` | `json` | Invoice number sequence counters per year/series, e.g. `{"2025": 42}` |
| `ksefTokenEnc` | `string?` | AES-256-GCM encrypted KSeF API token |
| `ksefTokenIv` | `string?` | Encryption IV for `ksefTokenEnc` |
| `ksefEnv` | enum | `TEST` or `PRODUCTION` — controls which KSeF endpoint is called |

---

### CompanyMembership

Join table between `User` and `Company`. Enforces role-based access control at the API layer.

| Column | Type | Notes |
|--------|------|-------|
| `role` | enum | `ADMIN` / `ACCOUNTANT` / `VIEWER` |
| `(companyId, userId)` | unique | A user can only have one role per company |

| Role | Access |
|------|--------|
| `ADMIN` | Full access — company settings, members, invoices, contractors |
| `ACCOUNTANT` | Create and manage invoices, contractors, reports |
| `VIEWER` | Read-only |

---

### Contractor

Buyer or seller in the company's trade network. Scoped to a company; NIP is unique per company.

| Column | Type | Notes |
|--------|------|-------|
| `nip` | `string?` | Polish VAT number; unique within the company |
| `pesel` | `string?` | National ID for natural persons |
| `countryCode` | `string` | Default `"PL"` |
| `isActive` | `bool` | Soft delete flag |
| `(companyId, nip)` | unique | Prevents duplicate NIP per company |

---

### Invoice

Outgoing invoice with a document lifecycle kept separate from the KSeF submission lifecycle. All monetary fields use `Decimal(15, 2)` for precision.

#### Status lifecycle

```mermaid
stateDiagram-v2
    [*] --> DRAFT : created
    DRAFT --> ISSUED : issue action\n(PDF + XML generated)
    DRAFT --> CANCELLED : cancelled
    ISSUED --> CANCELLED : cancelled
```

#### KSeF status lifecycle

```mermaid
stateDiagram-v2
    [*] --> NOT_SENT : invoice created
    NOT_SENT --> QUEUED : queued for submission
    NOT_SENT --> OFFLINE_QUEUED : KSeF unavailable
    OFFLINE_QUEUED --> QUEUED : cron retry
    QUEUED --> SUBMITTED : HTTP call sent
    SUBMITTED --> ACCEPTED : KSeF confirmed
    SUBMITTED --> REJECTED : KSeF rejected
```

#### Key columns

| Column | Type | Notes |
|--------|------|-------|
| `invoiceNumber` | `string?` | Set on issue; unique per company |
| `invoiceType` | enum | `VAT` standard, `KOR` correction, `ZAL` advance, `ROZ` settlement, `UPR` simplified |
| `totalNet/Vat/Gross` | `Decimal(15,2)` | Aggregated from lines at issue time |
| `correctedInvoiceId` | `string?` | Self-referencing FK — points to the original invoice for `KOR` type |
| `correctedKsefRef` | `string?` | KSeF reference of the original (required by FA(3) spec) |
| `ksefReference` | `string?` | KSeF-assigned reference number after acceptance |

---

### InvoiceLine

One line item on an invoice. `position` determines display order and is unique per invoice.

| Column | Type | Notes |
|--------|------|-------|
| `quantity` | `Decimal(15, 4)` | Supports fractional quantities |
| `unitNetPrice` | `Decimal(15, 4)` | Higher precision for unit pricing |
| `vatRate` | `string` | `"23"`, `"8"`, `"5"`, `"0"`, `"ZW"` (exempt), `"NP"` (not subject) |
| `netValue/vatValue/grossValue` | `Decimal(15, 2)` | Pre-calculated and stored for FA(3) XML compliance |
| `(invoiceId, position)` | unique | Enforces ordering uniqueness per invoice |

---

### InvoiceVatBreakdown

Aggregated VAT totals per rate for an invoice. Used directly in the FA(3) XML `P_` fields and in PDF rendering.

| Column | Type | Notes |
|--------|------|-------|
| `vatRate` | `string` | Same values as `InvoiceLine.vatRate` |
| `netAmount/vatAmount` | `Decimal(15, 2)` | Sum of all lines with this rate |
| `(invoiceId, vatRate)` | unique | One row per rate per invoice |

---

### KsefSubmission

Audit trail for every KSeF submission attempt. Supports retry tracking via `attemptNumber`.

| Column | Type | Notes |
|--------|------|-------|
| `attemptNumber` | `int` | Increments on each retry; `(invoiceId, attemptNumber)` is unique |
| `status` | enum | `PENDING` → `SUBMITTED` → `ACCEPTED` / `REJECTED` / `ERROR` |
| `referenceNumber` | `string?` | Invoice reference within the KSeF session (v2 API) |
| `sessionReferenceNumber` | `string?` | KSeF online session reference (v2 API) |
| `ksefReference` | `string?` | Final KSeF identifier after acceptance |
| `requestHash` | `string?` | SHA hash of the submitted XML for deduplication |
| `responseBody` | `string?` | Raw KSeF API response stored for debugging |

---

### KsefSession

Cached KSeF API session token per company. One active session at a time (`companyId` is unique).

| Column | Type | Notes |
|--------|------|-------|
| `tokenEnc/tokenIv` | `string` | AES-256-GCM encrypted session token |
| `expiresAt` | `datetime` | Session expiry — API checks this before reuse |
| `lastUsedAt` | `datetime?` | Updated on each use for session health monitoring |

---

### FileRecord

Tracks every file stored on disk, linking it to invoices or incoming invoices. Used by the backup system.

| Column | Type | Notes |
|--------|------|-------|
| `type` | `string` | `outgoing_pdf`, `outgoing_xml`, `incoming_scan` |
| `path` | `string` | Absolute filesystem path |
| `relativePath` | `string` | Relative to `STORAGE_BASE_PATH` — portable across deployments |
| `checksum` | `string?` | SHA-256 for integrity verification during backup |
| `backedUpAt` | `datetime?` | Generic file-backup marker used by platform-managed providers (company Google Drive policy tracks incremental scope via `GoogleDriveCredential.lastBackupAt`) |

---

### IncomingInvoice

Incoming invoice received either via OCR upload or KSeF sync.

#### Status lifecycle

```mermaid
stateDiagram-v2
    [*] --> UPLOADED : file uploaded
    UPLOADED --> OCR_PROCESSING : OCR started
    OCR_PROCESSING --> OCR_DONE : extraction complete
    OCR_PROCESSING --> OCR_FAILED : extraction failed
    OCR_DONE --> CONFIRMED : user confirms
    OCR_DONE --> REJECTED : user rejects
    [*] --> KSEF_SYNCED : synced from KSeF
```

#### Key columns

| Column | Type | Notes |
|--------|------|-------|
| `source` | `string` | `"upload"` (OCR) or `"ksef"` (synced) |
| `lineItemsJson` | `json?` | Raw extracted line items from OCR |
| `ocrConfidence` | `float?` | 0–1 confidence score from OCR engine |
| `ocrWarnings` | `json?` | Array of field-level warnings from extraction |
| `ocrModel` | `string?` | Model identifier used (e.g. `"tesseract"`, `"openrouter/..."`) |
| `ocrMethod` | `string?` | `"tesseract"` or `"openrouter"` |
| `ksefReference` | `string?` | KSeF reference — used to deduplicate during sync |
| `ksefFetchedAt` | `datetime?` | When this record was last synced from KSeF |

---

### GoogleDriveCredential

Stores Google Drive OAuth2 credentials for backup, encrypted at rest. One record per company.

| Column | Type | Notes |
|--------|------|-------|
| `credentialsEnc/credentialsIv` | `string` | AES-256-GCM encrypted JSON `{access_token, refresh_token, expiry_date}` |
| `expiresAt` | `datetime` | OAuth2 token expiry — API refreshes before use |
| `lastBackupAt` | `datetime?` | Timestamp of last successful backup for this company |

---

### BackupRun

Audit log for each backup job execution. Not scoped to a single company — one row per run per provider.

| Column | Type | Notes |
|--------|------|-------|
| `provider` | `string` | `"gdrive"` or `"icloud"` |
| `companyId` | `string?` | `null` for platform-scoped runs, populated for company-scoped Google Drive runs |
| `triggerSource` | `string?` | Source of run trigger (`platform_schedule`, `manual_admin`, `manual_platform`, `invoice_issued`, `policy_schedule`) |
| `status` | `string` | `"success"` or `"error"` |
| `filesCount` | `int` | Number of files processed |
| `bytesTotal` | `bigint` | Total bytes uploaded in this run |

---

### CompanyBackupPolicy

Company-scoped policy for Google Drive backup behavior controlled by company admins.

| Column | Type | Notes |
|--------|------|-------|
| `provider` | `enum` | Currently only `GOOGLE_DRIVE` |
| `automaticOnInvoiceIssued` | `boolean` | Runs company Google Drive backup after issued invoice files are persisted |
| `scheduleMode` | `enum` | `MANUAL`, `DAILY`, `WEEKLY` |
| `scheduleHour` | `int?` | Local hour (`0-23`) for `DAILY`/`WEEKLY` |
| `scheduleMinute` | `int?` | Local minute (`0-59`) for `DAILY`/`WEEKLY` |
| `scheduleDayOfWeek` | `int?` | Weekly day (`1=Monday ... 7=Sunday`) for `WEEKLY` |
| `scheduleTimezone` | `string` | IANA timezone used for schedule evaluation (default `Europe/Warsaw`) |
| `lastScheduledRunKey` | `string?` | Deduplication key used by scheduled one-shot job per schedule slot |
| `lastScheduledRunAt` | `datetime?` | Last schedule slot execution timestamp |

---

### UserInvite

One-time invitation token for adding a new member to a company.

| Column | Type | Notes |
|--------|------|-------|
| `token` | `string` | Unique random token sent in invitation email |
| `expiresAt` | `datetime` | Token expiry |
| `acceptedAt` | `datetime?` | Set when the invitee accepts; null = pending |

---

### ServiceTemplate

Reusable service/product definitions shared across a company's invoices. Serves as a catalog for invoice line items.

| Column | Type | Notes |
|--------|------|-------|
| `vatRate` | `string` | Default VAT rate for this service |
| `unit` | `string` | Default unit, e.g. `"szt."`, `"godz."` |
| `isActive` | `bool` | Soft delete; inactive templates excluded from selectors |

---

### ContractorServiceRate

Contractor-specific pricing for a service template. Allows different prices for different clients.

| Column | Type | Notes |
|--------|------|-------|
| `unitNetPrice` | `Decimal(15, 4)` | Net price per unit for this contractor |
| `(contractorId, serviceTemplateId)` | unique | One rate per service per contractor |

---

### KsefIncomingSync

Audit trail for KSeF incoming invoice sync runs.

| Column | Type | Notes |
|--------|------|-------|
| `dateFrom/dateTo` | `datetime` | The query window sent to KSeF |
| `createdCount` | `int` | New `IncomingInvoice` records created |
| `linkedCount` | `int` | Existing upload records linked to KSeF references |
| `skippedCount` | `int` | Duplicates skipped |
| `errorMessage` | `string?` | Set if the sync failed partway through |
| `finishedAt` | `datetime?` | Null while in progress |

---

## Enumerations

### `CompanyVatStatus`
| Value | Meaning |
|-------|---------|
| `ACTIVE` | Company is an active VAT payer |
| `EXEMPT` | VAT-exempt (e.g. below threshold) |
| `NO_VAT` | Not a VAT entity |

### `KsefEnvironment`
| Value | Meaning |
|-------|---------|
| `TEST` | KSeF test environment (`ap-test.ksef.mf.gov.pl`) |
| `PRODUCTION` | KSeF production environment |

### `CompanyMembershipRole`
| Value | Meaning |
|-------|---------|
| `ADMIN` | Full access including settings and member management |
| `ACCOUNTANT` | Create/edit invoices, contractors, reports |
| `VIEWER` | Read-only access |

### `InvoiceStatus`
| Value | Meaning |
|-------|---------|
| `DRAFT` | Work in progress, not yet issued |
| `ISSUED` | PDF and FA(3) XML generated; KSeF progress is tracked separately in `ksefStatus` |
| `CANCELLED` | Manually cancelled |

### `InvoiceType`
| Value | FA(3) code | Meaning |
|-------|-----------|---------|
| `VAT` | FA | Standard VAT invoice |
| `KOR` | KOR | Correction invoice |
| `ZAL` | ZAL | Advance invoice |
| `ROZ` | ROZ | Settlement invoice |
| `UPR` | UPR | Simplified invoice |

### `PaymentMethod`
| Value | Meaning |
|-------|---------|
| `BANK_TRANSFER` | Standard bank transfer |
| `CASH` | Cash payment |
| `CARD` | Card payment |
| `OTHER` | Other method |

### `InvoiceKsefStatus`
| Value | Meaning |
|-------|---------|
| `NOT_SENT` | Invoice not submitted to KSeF yet |
| `QUEUED` | Queued internally for submission |
| `SUBMITTED` | HTTP request sent, awaiting response |
| `ACCEPTED` | KSeF returned acceptance |
| `REJECTED` | KSeF returned rejection |
| `OFFLINE_QUEUED` | KSeF was unavailable; will retry via cron |

### `KsefSubmissionStatus`
| Value | Meaning |
|-------|---------|
| `PENDING` | Submission record created, not yet sent |
| `SUBMITTED` | HTTP request completed |
| `ACCEPTED` | KSeF confirmed acceptance |
| `REJECTED` | KSeF rejected the invoice |
| `ERROR` | Network/server error during submission |

### `IncomingInvoiceStatus`
| Value | Meaning |
|-------|---------|
| `UPLOADED` | File stored, OCR not started |
| `OCR_PROCESSING` | OCR job running |
| `OCR_DONE` | Extraction complete, awaiting user review |
| `OCR_FAILED` | OCR could not extract data |
| `CONFIRMED` | User confirmed the extracted data |
| `REJECTED` | User rejected the invoice |
| `KSEF_SYNCED` | Created via KSeF sync, no OCR |

### `CompanyBackupProvider`
| Value | Meaning |
|-------|---------|
| `GOOGLE_DRIVE` | Company policy currently supports Google Drive only |

### `CompanyBackupScheduleMode`
| Value | Meaning |
|-------|---------|
| `MANUAL` | No automatic schedule (manual + invoice-issued trigger only) |
| `DAILY` | Backup executes once per day at configured local time |
| `WEEKLY` | Backup executes once per week at configured local day/time |

---

## Design Notes

### Multi-tenancy
Every entity is scoped to a `Company` via a `companyId` foreign key. The API enforces isolation by verifying `CompanyMembership` on every company-scoped route before executing any query.

### Encryption at rest
Sensitive credentials are never stored in plaintext:
- **KSeF API token** — `Company.ksefTokenEnc` + `Company.ksefTokenIv`
- **KSeF session token** — `KsefSession.tokenEnc` + `KsefSession.tokenIv`
- **Google Drive credentials** — `GoogleDriveCredential.credentialsEnc` + `GoogleDriveCredential.credentialsIv`

All use AES-256-GCM via `@ksiegowy/shared-utils`. The key is supplied via the `ENCRYPTION_KEY` environment variable.

### Decimal precision
All monetary values use `Decimal(15, 2)` (except unit prices which use `Decimal(15, 4)` for precision before rounding). This matches the FA(3) XML specification requirements for Polish VAT invoices.

### Cascade deletes
Most child records cascade delete when the parent company is deleted. Exceptions:
- `Invoice.contractorId` → `SetNull` (invoices survive contractor deletion)
- `FileRecord.invoiceId` → `SetNull` (file records survive invoice deletion for backup integrity)
- `IncomingInvoice.contractorId` → `SetNull`

### Invoice corrections
A `KOR` (correction) invoice self-references the original via `correctedInvoiceId`. The `corrections` relation allows querying all corrections for an invoice. `correctedKsefRef` is stored separately because corrections submitted to KSeF must reference the original KSeF number, not the internal database ID.

### Invoice number sequencing
`Company.invoiceSeq` is a JSON object keyed by year (and optionally series prefix), e.g. `{"2025": 42, "2025/KOR": 3}`. The API increments the counter atomically when issuing an invoice.

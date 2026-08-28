# Architecture

This document describes the architecture of `ksiegowy-vibe` using C4 model diagrams and key flow diagrams.

---

## C4 Level 1 — System Context

Shows how the system fits into the world and who/what interacts with it.

```mermaid
C4Context
  title System Context — ksiegowy-vibe

  Person(user, "Accountant / Admin", "Manages invoices, contractors and company settings via browser")

  System(ksiegowy, "ksiegowy-vibe", "Self-hosted Polish VAT accounting platform with KSeF integration")

  System_Ext(google_oauth, "Google OAuth2", "User authentication via Google accounts")
  System_Ext(ksef, "KSeF (MF)", "Poland's National e-Invoice System — FA(3) XML submission and incoming invoice sync")
  System_Ext(gus, "GUS API", "Polish business registry — NIP/company lookup")
  System_Ext(openrouter, "OpenRouter API", "Vision LLM fallback for OCR of uploaded invoices")
  System_Ext(gdrive, "Google Drive", "Cloud backup for uploaded files and generated PDFs/XMLs")

  Rel(user, ksiegowy, "Uses", "HTTPS")
  Rel(ksiegowy, google_oauth, "Authenticates via", "HTTPS / OAuth2")
  Rel(ksiegowy, ksef, "Submits outgoing invoices, syncs incoming invoices", "HTTPS / REST")
  Rel(ksiegowy, gus, "Looks up company data by NIP", "HTTPS / REST")
  Rel(ksiegowy, openrouter, "Calls for vision OCR when Tesseract fails", "HTTPS / REST")
  Rel(ksiegowy, gdrive, "Uploads backup archives", "HTTPS / REST")
```

---

## C4 Level 2 — Containers

Shows the deployable units inside the system and how they communicate.

```mermaid
C4Container
  title Container Diagram — ksiegowy-vibe

  Person(user, "User", "Browser")

  System_Boundary(ksiegowy, "ksiegowy-vibe") {
    Container(web, "Web", "Next.js 15 / React 19", "Server-side rendered frontend. App Router with React Server Components. Port 3000.")
    Container(api, "API", "Fastify 5 / TypeScript / Node.js 22", "REST API. Handles business logic, auth, KSeF integration, OCR, PDF/XML generation. Port 3001.")
    ContainerDb(db, "Database", "PostgreSQL 17", "Stores all application data: companies, invoices, contractors, KSeF audit trails, backup records.")
    ContainerDb(storage, "File Storage", "Local filesystem (./storage)", "Stores uploaded PDFs/images, generated FA(3) XML files, and invoice PDFs.")
  }

  System_Ext(google_oauth, "Google OAuth2")
  System_Ext(ksef, "KSeF API")
  System_Ext(gus, "GUS API")
  System_Ext(openrouter, "OpenRouter API")
  System_Ext(gdrive, "Google Drive")

  Rel(user, web, "Navigates", "HTTPS :3000")
  Rel(web, api, "Calls REST endpoints", "HTTP :3001 / JWT cookie")
  Rel(api, db, "Reads/writes", "Prisma ORM / TCP")
  Rel(api, storage, "Reads/writes files", "Filesystem")
  Rel(api, google_oauth, "Authenticates users", "HTTPS / OAuth2")
  Rel(api, ksef, "Submits and syncs invoices", "HTTPS / REST")
  Rel(api, gus, "Looks up company by NIP", "HTTPS / REST")
  Rel(api, openrouter, "OCR fallback", "HTTPS / REST")
  Rel(api, gdrive, "Backup uploads", "HTTPS / REST")
```

---

## C4 Level 3 — API Components

Zooms into the API container to show its internal building blocks.

```mermaid
C4Component
  title Component Diagram — API (Fastify)

  System_Boundary(api, "API — apps/api") {

    Boundary(routes, "Routes Layer") {
      Component(route_auth, "auth/google", "Fastify route", "Google OAuth2 login and callback")
      Component(route_companies, "companies", "Fastify route", "Company CRUD and KSeF settings")
      Component(route_company_backup_policy, "companies/backup-policy", "Fastify route", "Company ADMIN Google Drive backup policy and manual trigger")
      Component(route_company_backup_status, "companies/backup-status", "Fastify route", "Company ADMIN read-only backup status for settings")
      Component(route_invoices, "invoices/outgoing", "Fastify route", "Invoice lifecycle: create, issue, send to KSeF")
      Component(route_incoming, "invoices/incoming", "Fastify route", "Incoming invoice upload and OCR review")
      Component(route_contractors, "contractors", "Fastify route", "Contractor CRUD, turnover-annotated list, per-contractor financial summary")
      Component(route_contractor_rates, "contractor-service-rates.routes", "Fastify route", "Per-contractor service rate overrides")
      Component(route_members, "members", "Fastify route", "Company membership and roles")
      Component(route_reports, "reports", "Fastify route", "VAT register and CSV export")
      Component(route_ksef, "ksef", "Fastify route", "KSeF queue status and session management")
      Component(route_backup, "backup", "Fastify route", "Platform/ops backup endpoints (legacy provider routes)")
    }

    Boundary(services, "Service Layer") {
      Component(svc_invoice, "InvoiceService", "TypeScript class", "Invoice business logic: create, issue, VAT totals, PDF/XML generation")
      Component(svc_ksef, "KsefService", "TypeScript class", "KSeF session auth, outgoing submission, offline queue retry")
      Component(svc_ksef_incoming, "KsefIncomingService", "TypeScript class", "Sync incoming invoices from KSeF, upsert by ksefReference")
      Component(svc_ocr, "OcrProcessor", "TypeScript module", "Orchestrates Tesseract + OpenRouter OCR; validates extracted schema")
      Component(svc_backup, "BackupService", "TypeScript module", "Google Drive and iCloud providers + company backup policy scheduler")
      Component(svc_registry, "CompanyRegistryService", "TypeScript class", "GUS API NIP lookup")
      Component(svc_contractor_financials, "ContractorFinancialsService", "TypeScript module", "Turnover/outstanding aggregation per contractor, excluding FORMAL corrections")
    }

    Boundary(plugins, "Plugins") {
      Component(plugin_prisma, "PrismaPlugin", "Fastify plugin", "Provides Prisma client via fastify.prisma")
      Component(plugin_auth, "AuthPlugin", "Fastify plugin", "JWT verification and company membership check on decorated routes")
    }

    Boundary(packages, "Internal Packages") {
      Component(pkg_fa3, "@ksiegowy/fa3-xml", "TypeScript package", "Builds, parses and XSD-validates FA(3) XML invoices")
      Component(pkg_pdf, "@ksiegowy/pdf-templates", "TypeScript package", "Generates invoice PDFs via Puppeteer")
      Component(pkg_ksef_client, "@ksiegowy/ksef-client", "TypeScript package", "HTTP client for the KSeF REST API")
      Component(pkg_utils, "@ksiegowy/shared-utils", "TypeScript package", "Encryption, NIP validation, VAT calc, Polish number-to-words")
    }
  }

  ContainerDb(db, "PostgreSQL 17")
  ContainerDb(storage, "File Storage")
  System_Ext(ksef_ext, "KSeF API")
  System_Ext(openrouter_ext, "OpenRouter API")
  System_Ext(gdrive_ext, "Google Drive")

  Rel(route_invoices, svc_invoice, "Calls")
  Rel(route_invoices, svc_ksef, "Calls")
  Rel(route_incoming, svc_ocr, "Calls")
  Rel(route_incoming, svc_ksef_incoming, "Calls")
  Rel(route_backup, svc_backup, "Calls")
  Rel(route_company_backup_policy, svc_backup, "Calls")
  Rel(route_companies, svc_registry, "Calls")
  Rel(route_contractors, svc_contractor_financials, "Calls")

  Rel(svc_invoice, pkg_fa3, "Builds FA(3) XML")
  Rel(svc_invoice, pkg_pdf, "Generates PDF")
  Rel(svc_invoice, pkg_utils, "VAT calc, encryption")
  Rel(svc_ksef, pkg_ksef_client, "Submits invoices")
  Rel(svc_ksef_incoming, pkg_ksef_client, "Queries KSeF")

  Rel(svc_invoice, plugin_prisma, "DB queries")
  Rel(svc_ksef, plugin_prisma, "DB queries")
  Rel(svc_ocr, openrouter_ext, "Vision LLM fallback")
  Rel(svc_backup, gdrive_ext, "Uploads files")
  Rel(pkg_ksef_client, ksef_ext, "REST calls")
  Rel(svc_invoice, storage, "Writes PDF/XML")
```

---

## Contractor Financials

`GET /companies/:companyId/contractors` accepts `status` (`active` | `inactive` | `all`,
default `active`) and `year` (default current UTC year) querystring parameters. Each
contractor in the response now carries `turnover` (year-to-date gross, decimal string)
and `turnoverYear`. `GET /companies/:companyId/contractors/:id/summary` returns a
per-contractor card: year-scoped `turnover`/`paidThisYear`, an **all-time** `outstanding`
balance (a prior year's unpaid invoice is still owed this year, so it is never
year-scoped), and up to 3 `recentDocuments` (newest first, not year-scoped, so a
dormant contractor still shows its history).

Both are backed by `apps/api/src/services/contractor-financials.service.ts`. Every
aggregate query there filters `status: 'ISSUED'` and, critically, `NOT: { correctionMode:
'FORMAL' }`: a FORMAL correction stores a full positive duplicate of the original
invoice's totals (KSeF "formal correction" = same amounts, corrected metadata only), so
including it would roughly double the contractor's turnover. CANCELLATION corrections
store negative totals and stay included — they net the sum back down to the correct
figure. Money is handled exclusively via Prisma `Decimal` arithmetic (never
`parseFloat`/JS number math), and `outstanding` is clamped at zero to avoid showing a
misleading negative balance on overpayment.

The list endpoint stays at 2 queries (contractors + one `groupBy` for turnover); the
summary endpoint runs its 3 queries (year aggregate, all-time aggregate, recent
documents) in a single `Promise.all`.

The per-contractor service-rate CRUD (`/companies/:companyId/contractors/:id/service-rates`)
lives in its own route file, `contractor-service-rates.routes.ts`, split out from
`contractors.ts` to keep contractor identity/financials and rate-override management as
separate concerns.

---

## Flow Diagrams

### Outgoing Invoice Lifecycle

```mermaid
flowchart TD
    A([User creates invoice]) --> B[Save as DRAFT\nInvoice + InvoiceLines stored in DB]
    B --> C{Edit / add lines}
    C -->|continue editing| B
    C -->|issue| D[Issue invoice\nCalculate VAT breakdown\nGenerate FA3 XML\nGenerate PDF\nSave FileRecords\nStatus → ISSUED]
    D --> E{Send to KSeF?}
    E -->|yes| F{KSeF available?}
    F -->|yes| G[Submit FA3 XML to KSeF\nKsefSubmission → SUBMITTED\nInvoice.status stays ISSUED\nInvoice.ksefStatus → SUBMITTED]
    F -->|no| H[Enqueue offline\nKsefSubmission → OFFLINE_QUEUED]
    H --> I[Daily cron retries queue]
    I --> F
    G --> J{Poll KSeF status}
    J -->|accepted| K[KsefSubmission → ACCEPTED\nStore KSeF reference number\nInvoice.ksefStatus → ACCEPTED]
    J -->|rejected| L[KsefSubmission → REJECTED\nInvoice.ksefStatus → REJECTED\nLog error]
    K --> N{Need correction?}
    N -->|yes| O[Create KOR draft from accepted original\nPersist original invoice number, issue date, and KSeF reference]
    O --> D
    N -->|no| P([Invoice stays accepted])
    E -->|no, keep issued| M([Invoice stays ISSUED])
```

### Incoming Invoice — OCR Upload

```mermaid
flowchart TD
    A([User uploads PDF or image]) --> B[Store file in ./storage\nCreate FileRecord\nIncomingInvoice → UPLOADED]
    B --> C[Start OCR processing\nStatus → OCR_PROCESSING]
    C --> D{Try Tesseract\nlocal Polish OCR}
    D -->|success| E[Extract invoice fields\nValidate schema\nConfidence score]
    D -->|fail / low confidence| F[Call OpenRouter\nvision LLM fallback]
    F --> E
    E --> G[Status → OCR_DONE\nStore extracted data\nStore warnings]
    G --> H([User reviews OCR results])
    H --> I{Confirm or reject?}
    I -->|confirm| J[Link to Contractor optional\nStatus → CONFIRMED]
    I -->|reject| K[Status → REJECTED]
```

### Incoming Invoice — KSeF Sync

```mermaid
flowchart TD
    A([User triggers KSeF sync\nor scheduled run]) --> B[Create KsefIncomingSync record\nStatus → IN_PROGRESS]
    B --> C[Authenticate KSeF session\nusing encrypted token]
    C --> D[Query KSeF for invoices\nwhere company is buyer\nfor requested date range]
    D --> E{For each invoice\nfrom KSeF}
    E --> F{Exists in DB\nby ksefReference?}
    F -->|yes| G[Update existing\nIncomingInvoice]
    F -->|no| H[Create new\nIncomingInvoice\nStatus → KSEF_SYNCED]
    G --> I{More invoices?}
    H --> I
    I -->|yes| E
    I -->|no| J[KsefIncomingSync → COMPLETED\nStore count of synced invoices]
    J --> K([Invoices visible\nin Incoming view])
```

### Authentication Flow

```mermaid
sequenceDiagram
    actor User as User (Browser)
    participant Web as Web (Next.js)
    participant API as API (Fastify)
    participant Google as Google OAuth2

    User->>Web: Click "Sign in with Google"
    Web->>API: GET /auth/google
    API->>Google: Redirect to OAuth consent
    Google-->>User: Show consent screen
    User->>Google: Approve
    Google->>API: Callback with auth code
    API->>Google: Exchange code for tokens
    Google-->>API: Access token + user info
    API->>API: Upsert User record in DB
    API->>API: Sign JWT access token + refresh token
    API-->>Web: Set httpOnly cookies (auth_token, refresh_token)
    Web-->>User: Redirect to /dashboard

    Note over User,Web: First run — no company yet
    Web->>Web: /dashboard finds no active company
    Web-->>User: Redirect to /onboarding (company → KSeF → invite)
    Note over User,Web: After POST /companies the session is re-minted via<br/>/api/session/refresh so the JWT carries the new company claim

    Note over User,API: Subsequent requests
    User->>Web: Navigate to page
    Web->>API: REST call with auth_token cookie
    API->>API: Verify JWT signature
    API->>API: Check CompanyMembership
    API-->>Web: Response
    Web-->>User: Rendered page

    Note over User,API: Token refresh
    Web->>API: GET /api/session/refresh (refresh_token cookie)
    API->>API: Verify refresh token
    API-->>Web: New auth_token cookie
```

### Package Dependency Graph

```mermaid
flowchart LR
    subgraph apps["Apps"]
        API["apps/api\nFastify REST API"]
        WEB["apps/web\nNext.js Frontend"]
        E2E["apps/e2e\nPlaywright Tests"]
    end

    subgraph packages["Shared Packages"]
        TYPES["@ksiegowy/types\nShared TypeScript types"]
        UTILS["@ksiegowy/shared-utils\nEncryption · NIP · VAT calc"]
        KSEF["@ksiegowy/ksef-client\nKSeF HTTP client"]
        FA3["@ksiegowy/fa3-xml\nFA3 builder · parser · XSD"]
        PDF["@ksiegowy/pdf-templates\nPuppeteer PDF generator"]
    end

    subgraph services["Domain Services"]
        HOUSEHOLD["@ksiegowy/household-service\nHousehold domain logic + Prisma schema"]
    end

    API --> TYPES
    API --> UTILS
    API --> KSEF
    API --> FA3
    API --> PDF
    API --> HOUSEHOLD

    WEB --> TYPES

    KSEF --> TYPES
    FA3 --> TYPES
    FA3 --> UTILS
    PDF --> TYPES
```

---

## Household Bounded Context (Personal Mode)

Personal/household budgeting is a separate bounded context from company bookkeeping: its own Prisma schema and Postgres database (`ksiegowy_household`), owned end-to-end by the `@ksiegowy/household-service` package (`services/household/`). `apps/api` depends on it as a thin HTTP layer only — no household query logic exists inside `apps/api` itself, and no household service imports from the company/invoice/KSeF services or vice versa.

```mermaid
C4Component
  title Household Bounded Context

  Container_Boundary(api, "apps/api") {
    Component(householdRoutes, "routes/household/*", "Fastify plugins", "Schema validation, live membership guard, HTTP mapping — no business logic")
    Component(householdPlugin, "plugins/household-database.ts", "Fastify plugin", "Decorates fastify.householdDatabase from the package's factory")
    Component(cronJobs, "lib/cron.ts", "node-cron", "Daily: commitment generation + renewal reminder sweep")
  }

  Container_Boundary(pkg, "@ksiegowy/household-service") {
    Component(domainServices, "src/domain/*.service.ts", "TypeScript", "Household, account, transaction, categorization-rule, statement-import, budget-envelope, commitment, commitment-reminder — zero Fastify imports")
    ContainerDb(householdDb, "Household Prisma Client", "generated client", "services/household/src/generated/client")
  }

  ContainerDb(householdPostgres, "ksiegowy_household", "PostgreSQL 17", "Separate database from the business schema — no cross-database joins")

  Rel(householdRoutes, domainServices, "Calls", "function calls, fastify.householdDatabase passed in")
  Rel(householdPlugin, domainServices, "Constructs client via", "createHouseholdDatabase()")
  Rel(cronJobs, domainServices, "Calls directly", "generateDueCommitmentTransactions(), runRenewalReminderSweep()")
  Rel(domainServices, householdDb, "Uses")
  Rel(householdDb, householdPostgres, "Queries", "Prisma / TCP")
```

Key backend decisions (full detail in [`docs/household-mode.md`](./household-mode.md)):
- **No JWT `households` claim** — every household route does a live `HouseholdMembership` lookup instead, so a removed member loses access immediately rather than after the access-token TTL.
- **Private-account visibility** is enforced by one function, `visibleAccountIds()`, used by every list and aggregate query — a private account owned by someone else is omitted, never returned with a redacted balance.
- **Transfers** between accounts are two `HouseholdTransaction` rows sharing `transferGroupId` (not a `type` enum), so every income/expense/envelope aggregate stays a plain `SUM(amount)` with one `transferGroupId IS NULL` predicate.
- **Commitment-generation cron is idempotent** at the database level via `@@unique([commitmentId, date])` — a retry or double-run cannot double-charge a commitment.

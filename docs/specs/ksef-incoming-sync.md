# Spec: KSeF Incoming Invoice Sync

Fetch invoices from KSeF where the company is the buyer (subject2), sync with `IncomingInvoice` records, and provide a test seed script for the KSeF TEST environment.

---

## Scope

- Query KSeF for incoming invoices (company as buyer) over a given date range
- Upsert into `IncomingInvoice`: link existing OCR-uploaded invoices or create new ones
- Expose a sync endpoint: `POST /companies/:companyId/incoming/ksef-sync`
- Add `scripts/ksef-seed-incoming.ts` for populating KSeF TEST with fixture invoices

Out of scope: async/batch sync for very large date ranges, push notifications, automatic scheduled sync.

---

## Phase 1 — DB Schema

**File**: `apps/api/prisma/schema.prisma`

### `IncomingInvoiceStatus` enum — add `KSEF_SYNCED`

```prisma
enum IncomingInvoiceStatus {
  UPLOADED
  OCR_PROCESSING
  OCR_DONE
  OCR_FAILED
  CONFIRMED
  REJECTED
  KSEF_SYNCED   // new — fetched from KSeF, no OCR review needed
}
```

### `IncomingInvoice` model — add two fields

```prisma
source        String    @default("upload")  // "upload" | "ksef"
ksefFetchedAt DateTime?                     // last time synced from KSeF
```

### New model `KsefIncomingSync`

Tracks each sync run for audit purposes.

```prisma
model KsefIncomingSync {
  id           String    @id @default(cuid())
  companyId    String
  dateFrom     DateTime
  dateTo       DateTime
  createdCount Int       @default(0)
  linkedCount  Int       @default(0)
  skippedCount Int       @default(0)
  errorMessage String?
  finishedAt   DateTime?
  createdAt    DateTime  @default(now())
  company      Company   @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId])
}
```

Add relation to `Company`:
```prisma
ksefIncomingSyncs KsefIncomingSync[]
```

**Migration**: `pnpm --filter @ksiegowy/api prisma:migrate:dev -- --name add_ksef_incoming_sync`

---

## Phase 2 — Shared KSeF Types

**File**: `packages/types/src/ksef.ts` — append to existing file

```typescript
// Header entry in POST /query/invoice/sync → invoiceHeaderList[]
export interface KsefIncomingInvoiceHeader {
  readonly ksefReferenceNumber: string;
  readonly invoiceNumber: string;
  readonly invoicingDate: string; // YYYY-MM-DD
  readonly invoiceType: string;   // "VAT" | "KOR" | ...
  readonly currency: string;
  readonly net: string;
  readonly vat: string;
  readonly gross: string;
  readonly subjectBy: {
    readonly issuedByIdentifier: { readonly type: string; readonly value: string };
    readonly issuedByName: string;
  };
  readonly subject2: {
    readonly issuedToIdentifier: { readonly type: string; readonly value: string };
    readonly issuedToName: string;
  };
}

// Full response from POST /query/invoice/sync
export interface KsefInvoiceQueryResult {
  readonly pageOffset: number;
  readonly pageSize: number;
  readonly numberOfElements: number;
  readonly invoiceHeaderList: readonly KsefIncomingInvoiceHeader[];
}

// Input for client.queryIncomingInvoices()
export interface KsefQueryIncomingInvoicesInput {
  readonly accessToken: string;
  readonly dateFrom: string; // YYYY-MM-DD
  readonly dateTo: string;   // YYYY-MM-DD
  readonly pageOffset?: number;
  readonly pageSize?: number;
}
```

---

## Phase 3 — KSeF Client

### `packages/ksef-client/src/types.ts`

Add two method signatures to the `KsefClient` interface:

```typescript
queryIncomingInvoices(input: KsefQueryIncomingInvoicesInput): Promise<KsefInvoiceQueryResult>;
fetchInvoiceXml(input: { accessToken: string; ksefReferenceNumber: string }): Promise<string>;
```

Import the new types from `@ksiegowy/types`.

### `packages/ksef-client/src/client.ts`

**New path constants** (add near existing constants):

```typescript
const QUERY_INVOICE_SYNC_PATH = '/query/invoice/sync';
const INVOICES_PATH = '/invoices';
```

**`queryIncomingInvoices` implementation**:

- `POST /query/invoice/sync` via existing `performJsonRequest`
- Header: `Authorization: Bearer {accessToken}`
- Body:
  ```json
  {
    "queryCriteria": {
      "subjectType": "subject2",
      "dateRange": {
        "type": "InvoiceCreationDate",
        "startDate": "<dateFrom>",
        "endDate": "<dateTo>"
      }
    },
    "pageOffset": 0,
    "pageSize": 100
  }
  ```
- Validate response has `invoiceHeaderList` array; throw `KsefClientError` with code `KSEF_QUERY_INCOMING_INVALID_RESPONSE` if not
- Error codes: `KSEF_QUERY_INCOMING_NETWORK_ERROR`, `KSEF_QUERY_INCOMING_HTTP_ERROR`, `KSEF_QUERY_INCOMING_INVALID_JSON`
- Returns `KsefInvoiceQueryResult`

**`fetchInvoiceXml` implementation**:

- `GET /invoices/{encodeURIComponent(ksefReferenceNumber)}`
- Does **not** use `performJsonRequest` — KSeF returns raw XML bytes
- Headers: `Authorization: Bearer {accessToken}`, `Accept: application/octet-stream`
- On network error: throw `KsefClientError` with code `KSEF_FETCH_XML_NETWORK_ERROR`
- On non-OK HTTP: throw `KsefClientError` with code `KSEF_FETCH_XML_HTTP_ERROR` (include status code)
- On success: return `response.text()`

---

## Phase 4 — FA(3) XML Parser

**File**: `packages/fa3-xml/src/parser.ts` (new file)

### Exported types

```typescript
export interface ParsedFa3Invoice {
  readonly invoiceNumber: string;
  readonly issueDate: string;           // YYYY-MM-DD
  readonly saleDate: string | null;
  readonly currency: string;
  readonly sellerNip: string;
  readonly sellerName: string;
  readonly sellerAddress: string | null;
  readonly buyerNip: string | null;
  readonly buyerName: string | null;
  readonly totalNet: string;
  readonly totalVat: string;
  readonly totalGross: string;
  readonly dueDate: string | null;
  readonly bankAccount: string | null;
  readonly paymentMethod: string | null; // '1' | '6' | null
  readonly lineItems: readonly ParsedFa3LineItem[];
}

export interface ParsedFa3LineItem {
  readonly position: number;
  readonly name: string;
  readonly unit: string | null;
  readonly quantity: string;
  readonly unitNetPrice: string;
  readonly vatRate: string;
  readonly netValue: string;
  readonly vatValue: string;
}
```

### Exported function

```typescript
export const parseFa3Xml = (xml: string): ParsedFa3Invoice
```

### Implementation notes

- Use a helper `extractTagValue(xml: string, tagName: string): string | null` — regex `<{tagName}[^>]*>([^<]*)</{tagName}>`, trim result
- All FA(3) value nodes are plain text (no CDATA, no nested elements inside value tags)
- For `Podmiot1` / `Podmiot2` blocks: extract the block first with `/<Podmiot1>([\s\S]*?)<\/Podmiot1>/`
- For line items: split on `<FaWiersz>`, skip first element (pre-first-tag content)
- `totalVat` = sum of all `P_14_1` through `P_14_7` (and `P_14_N`, `P_14_Wsp`) fields found in the XML
- Throw `Error('parseFa3Xml: missing required field: {fieldName}')` if any of `invoiceNumber`, `issueDate`, `sellerNip`, `sellerName`, `totalGross` are absent

### Export from package index

**File**: `packages/fa3-xml/src/index.ts` — add:
```typescript
export { parseFa3Xml } from './parser.js';
export type { ParsedFa3Invoice, ParsedFa3LineItem } from './parser.js';
```

---

## Phase 5 — KSeF Incoming Service

**File**: `apps/api/src/services/ksef-incoming.service.ts` (new file)

### Signature

```typescript
export const syncIncomingInvoicesFromKsef = async (
  prisma: PrismaClient,
  companyId: string,
  encryptionKey: string,
  dateFrom: string,
  dateTo: string,
  logger: FastifyBaseLogger
): Promise<{ created: number; linked: number; skipped: number; syncId: string }>
```

### Algorithm

```
1. Load company { nip, ksefEnv, ksefTokenEnc, ksefTokenIv }
   → throw 404-equivalent Error if not found

2. Create KsefIncomingSync record { companyId, dateFrom, dateTo }
   → syncId = sync.id

3. Get access token: getOrCreateKsefSession(prisma, companyId, encryptionKey)

4. Create KSeF client: createKsefClient({ environment: company.ksefEnv.toLowerCase() })

5. Pagination loop (pageSize = 100, pageOffset starts at 0):

   a. result = client.queryIncomingInvoices({ accessToken, dateFrom, dateTo, pageOffset, pageSize: 100 })

   b. For each header in result.invoiceHeaderList:
      sellerNip = header.subjectBy.issuedByIdentifier.value

      CASE A — already linked to KSeF:
        existing = prisma.incomingInvoice.findFirst({ where: { companyId, ksefReference: header.ksefReferenceNumber } })
        if found → update { ksefFetchedAt: now() }; skipped++; continue

      CASE B — uploaded via OCR, not yet linked:
        existing = prisma.incomingInvoice.findFirst({
          where: { companyId, sellerNip, invoiceNumber: header.invoiceNumber, ksefReference: null }
        })
        if found → update { ksefReference, ksefFetchedAt: now(), status: 'KSEF_SYNCED' }; linked++; continue

      CASE C — not in system:
        xml = client.fetchInvoiceXml({ accessToken, ksefReferenceNumber: header.ksefReferenceNumber })
        parsed = parseFa3Xml(xml)
        contractorId = prisma.contractor.findUnique({ where: { companyId_nip: { companyId, nip: sellerNip } } })?.id ?? null
        prisma.incomingInvoice.create({
          companyId, source: 'ksef', status: 'CONFIRMED',
          ksefReference: header.ksefReferenceNumber,
          ksefFetchedAt: now(), confirmedAt: now(),
          sellerNip, sellerName: parsed.sellerName, sellerAddress: parsed.sellerAddress,
          buyerName: parsed.buyerName, buyerNip: parsed.buyerNip,
          invoiceNumber: parsed.invoiceNumber,
          issueDate: new Date(parsed.issueDate),
          saleDate: parsed.saleDate ? new Date(parsed.saleDate) : null,
          totalNet: parsed.totalNet, totalVat: parsed.totalVat, totalGross: parsed.totalGross,
          currency: parsed.currency,
          dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
          bankAccount: parsed.bankAccount,
          lineItemsJson: parsed.lineItems,
          contractorId
        })
        created++

   c. If (pageOffset + pageSize) >= result.numberOfElements → break
      Else → pageOffset += pageSize; repeat

6. Update KsefIncomingSync { createdCount, linkedCount, skippedCount, finishedAt: now() }

7. Log info: { companyId, created, linked, skipped, syncId }

8. Return { created, linked, skipped, syncId }
```

### Error handling

Wrap the sync body in try/catch. On error:
- Update `KsefIncomingSync.errorMessage = error.message`
- Re-throw

On KSeF 401: call `initKsefSession(prisma, companyId, encryptionKey)` once to get a fresh `accessToken`, then retry the failed request (same pattern as `submitInvoiceToKsef`).

### Imports

```typescript
import { getOrCreateKsefSession, initKsefSession } from './ksef.service.js';
import { createKsefClient } from '@ksiegowy/ksef-client';
import { parseFa3Xml } from '@ksiegowy/fa3-xml';
import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
```

---

## Phase 6 — API Route

**File**: `apps/api/src/routes/invoices/incoming.ts` — add one endpoint to existing `incomingInvoiceRoutes` plugin

### `POST /companies/:companyId/incoming/ksef-sync`

**Auth**: `fastify.authenticate` + role check — VIEWER throws 403

**Body schema**:
```typescript
{
  dateFrom: string; // format: date, e.g. "2024-01-01"
  dateTo: string;   // format: date, e.g. "2024-03-31"
}
```

**Response 200**:
```typescript
{
  syncId: string;
  created: number;
  linked: number;
  skipped: number;
}
```

**Validation** (throw 400 if violated):
- `dateFrom` must be ≤ `dateTo`
- Date range must be ≤ 366 days

**Implementation**:
```typescript
const encryptionKey = process.env['ENCRYPTION_KEY']!;
request.log.info({ companyId, dateFrom, dateTo }, 'KSeF incoming invoice sync started');
const result = await syncIncomingInvoicesFromKsef(
  fastify.prisma, companyId, encryptionKey, dateFrom, dateTo, request.log
);
return result;
```

---

## Phase 7 — Frontend

**Files to modify**:

- `apps/web/src/lib/api-types.ts` — add:
  ```typescript
  export interface KsefIncomingSyncResult {
    syncId: string;
    created: number;
    linked: number;
    skipped: number;
  }
  ```

- `apps/web/src/lib/api-client.ts` — add:
  ```typescript
  syncIncomingFromKsef(companyId: string, dateFrom: string, dateTo: string): Promise<KsefIncomingSyncResult>
  ```

- `apps/web/src/lib/translations.ts` — add Polish labels:
  - `"Synchronizuj z KSeF"`
  - `"Synchronizacja zakończona"`, `"Nowych faktur: {n}, powiązanych: {n}, pominiętych: {n}"`
  - `"Synchronizacja nie powiodła się"`

- Incoming invoices list page — add "Synchronizuj z KSeF" button that:
  - Opens a date range picker (defaulting to current month)
  - Calls `syncIncomingFromKsef`, shows loading state
  - On success: shows toast with `created/linked/skipped` counts and refreshes the list
  - On error: shows error toast

---

## Phase 8 — Test Seed Script

**File**: `scripts/ksef-seed-incoming.ts` (new, test-only)

> ⚠️ TEST ONLY — Never run with `--production` unless you intend to create real, permanent invoices.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `KSEF_CONTRACTOR_TOKEN` | No¹ | KSeF API token of the contractor (submitter) |
| `KSEF_CONTRACTOR_NIP` | No¹ | NIP of the contractor. Defaults to `9876543210` |
| `KSEF_AUTH_TOKEN` | Fallback | Trysoft's token — used if `KSEF_CONTRACTOR_TOKEN` is absent (self-invoice mode) |
| `KSEF_NIP` | Fallback | Trysoft's NIP, defaults to `1234563218` |

¹ If `KSEF_CONTRACTOR_TOKEN` is absent, submits self-invoices (Trysoft as both seller and buyer). Valid in TEST only.

### CLI flags

| Flag | Default | Description |
|---|---|---|
| `--count <n>` | `5` | Number of invoices to submit |
| `--dry-run` | false | Build + validate XML but skip KSeF submission |
| `--production` | false | Use production KSeF (requires explicit opt-in) |
| `--help` | — | Print usage |

### Fixture contractors

```typescript
const FIXTURE_CONTRACTORS = [
  { nip: '9876543210', name: 'Example Client sp. z o.o.',  addressLine1: 'ul. Przykładowa 2, 00-002 Warszawa' },
  { nip: '1111111111', name: 'Dostawca Alfa sp. z o.o.',            addressLine1: 'ul. Przykładowa 10, 00-001 Warszawa' },
  { nip: '1234563218', name: 'Dostawca Beta S.A.',          addressLine1: 'ul. Przykładowa 20, 00-002 Warszawa' },
];
```

### Invoice generation

- Rotate through `FIXTURE_CONTRACTORS` (index mod count)
- Issue dates: evenly spread over the last 90 days from today
- Services (rotate): `['Usługi IT', 'Konsulting', 'Hosting', 'Licencje oprogramowania', 'Szkolenia']`
- Net amounts: `[500, 1200, 2500, 800, 4500]` PLN, 23% VAT
- Payment method: `bank_transfer`, due date: +30 days from issue date
- Buyer (subject2): always Trysoft — `{ nip: KSEF_NIP, name: 'Acme Software sp. z o.o.', addressLine1: 'ul. Testowa 1, 00-001 Warszawa' }`

### Submission flow (per invoice)

1. `buildFa3Xml(invoiceData)` — seller = fixture contractor, buyer = Trysoft
2. `validateFa3XmlAgainstXsd(xml)` — abort script if invalid (contract error before any network call)
3. If `--dry-run`: print XML summary, skip steps 4–5
4. Authenticate: `client.initAuthSession({ ksefToken, nip: contractorNip })`
5. `client.submitInvoice({ accessToken, xml })`
6. Print: `✅ [{i}/{count}] ksefRef={ksefReferenceNumber} | seller={nip} | gross={amount} PLN`

### Output summary

```
✅ 5 invoices submitted to KSeF TEST.

Run the following to import them:
  POST /companies/{companyId}/incoming/ksef-sync
  Body: { "dateFrom": "YYYY-MM-DD", "dateTo": "YYYY-MM-DD" }
```

---

## Implementation Order

```
Phase 1  (DB schema + migration)
Phase 2  (shared types)
Phase 3  (KSeF client methods)        ← depends on Phase 2
Phase 4  (FA(3) XML parser)
Phase 5  (incoming sync service)      ← depends on Phases 1, 3, 4
Phase 6  (API route)                  ← depends on Phase 5
Phase 8  (seed script)                ← depends on Phase 3, needs Phase 6 to test with
Phase 7  (frontend)                   ← depends on Phase 6
```

---

## Decision Log

| Decision | Choice | Reason |
|---|---|---|
| Sync endpoint style | Synchronous POST | KSeF `/query/invoice/sync` is fast; 100 invoices/page is manageable synchronously |
| Status for KSeF-fetched invoices | `KSEF_SYNCED` (new enum value) | Distinguishes from manual `CONFIRMED`; signals no OCR review needed |
| Match strategy for existing invoices | ksefReference first, then sellerNip+invoiceNumber | Handles both upload-first and KSeF-first flows without duplicates |
| XML parsing | Regex-based tag extractor | No external dependency; FA(3) value nodes are plain text with no nesting |
| Date range cap | 366 days per request | Aligns with KSeF API recommendation; users can call multiple times |
| Seed auth mode | Contractor token with Trysoft self-invoice fallback | Realistic without requiring two KSeF accounts |

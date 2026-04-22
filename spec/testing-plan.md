# Testing Plan

## Overview

This document specifies the unit tests to be added to improve stability across the core business logic. The codebase currently has 8 test files covering ~50+ source files. The focus is on deterministic, high-value areas: financial calculations, cryptography, and data parsing.

**Test framework:** Vitest (already configured in `apps/api`, `packages/shared-utils`, `packages/fa3-xml`)

---

## Existing Coverage (reference)

| File | Tests |
|------|-------|
| `packages/shared-utils/src/slownie.ts` | ✅ 29 cases |
| `packages/fa3-xml/src/builder.ts` | ✅ covered |
| `packages/ksef-client/src/auth.ts` | ✅ covered |
| `packages/ksef-client/src/client.ts` | ✅ covered |
| `apps/api/src/routes/ready.ts` | ✅ covered |
| `apps/api/src/routes/auth/google.ts` | ✅ covered |
| `apps/api/src/plugins/prisma.ts` | ✅ covered |
| `apps/api/src/lib/auth-config.ts` | ✅ covered |

---

## Tests to Add

### 1. NIP Validator — `packages/shared-utils/src/nip-validator.test.ts`

Source: `packages/shared-utils/src/nip-validator.ts`

#### `normalizeNip()`

| Case | Input | Expected |
|------|-------|----------|
| Strips hyphens | `'123-456-32-18'` | `'1234563218'` |
| Strips spaces | `'123 456 32 18'` | `'1234563218'` |
| Leaves plain digits unchanged | `'1234563218'` | `'1234563218'` |

#### `isValidNip()`

| Case | Input | Expected |
|------|-------|----------|
| Valid NIP | `'1234563218'` | `true` |
| Invalid checksum | `'1234563219'` | `false` |
| All zeros | `'0000000000'` | `false` |
| Too short | `'123456789'` | `false` |
| Too long | `'12345678901'` | `false` |
| Checksum equals 10 (invalid by spec) | construct such NIP | `false` |
| With dashes (normalized first) | `'123-456-32-18'` | `true` |

---

### 2. VAT Calculator — `packages/shared-utils/src/vat-calc.test.ts`

Source: `packages/shared-utils/src/vat-calc.ts`

#### `computeVatLineTotals()`

| Case | Input | Expected |
|------|-------|----------|
| 23% VAT, round numbers | `{ quantity: 2, unitNetPrice: 100, vatRatePercent: 23 }` | `{ net: 200.00, vat: 46.00, gross: 246.00 }` |
| 8% VAT | `{ quantity: 1, unitNetPrice: 50, vatRatePercent: 8 }` | `{ net: 50.00, vat: 4.00, gross: 54.00 }` |
| 0% VAT | `{ quantity: 3, unitNetPrice: 10, vatRatePercent: 0 }` | `{ net: 30.00, vat: 0.00, gross: 30.00 }` |
| Rounding: 23% on 1.00 qty | `{ quantity: 1, unitNetPrice: 1.00, vatRatePercent: 23 }` | `{ net: 1.00, vat: 0.23, gross: 1.23 }` |
| Fractional quantity | `{ quantity: 0.5, unitNetPrice: 10, vatRatePercent: 23 }` | `{ net: 5.00, vat: 1.15, gross: 6.15 }` |

---

### 3. Encryption — `packages/shared-utils/src/encryption.test.ts`

Source: `packages/shared-utils/src/encryption.ts`

#### `parseEncryptionKey()`

| Case | Input | Expected |
|------|-------|----------|
| Valid 64-char hex key | 64-char hex string | Returns 32-byte Buffer |
| Too short | 32-char hex string | Throws with message about required length |
| Too long | 128-char hex string | Throws |

#### `encrypt()` / `decrypt()` (round-trip)

| Case | Description | Expected |
|------|-------------|----------|
| Round-trip plain ASCII | Encrypt then decrypt `'hello world'` | Returns `'hello world'` |
| Round-trip empty string | Encrypt then decrypt `''` | Returns `''` |
| Round-trip unicode | Encrypt then decrypt `'zł 100.00'` | Returns `'zł 100.00'` |
| Unique IVs | Encrypt same plaintext twice | `iv` values differ between calls |
| Tampered ciphertext | Flip a byte in `enc`, then decrypt | Throws (auth tag mismatch) |
| Tampered IV | Flip a byte in `iv`, then decrypt | Throws |

---

### 4. Invoice Math — `packages/fa3-xml/src/invoice-math.test.ts`

Source: `packages/fa3-xml/src/invoice-math.ts`

#### `calculateInvoiceTotals()`

| Case | Description | Expected |
|------|-------------|----------|
| Single line 23% | 1 × 100.00 @ 23% | `net=100.00`, `vat=23.00`, `gross=123.00` |
| Single line 8% | 1 × 50.00 @ 8% | `net=50.00`, `vat=4.00`, `gross=54.00` |
| Zero-VAT rate `zw` | 1 × 200.00 @ zw | `vat=0.00`, `gross=200.00` |
| Zero-VAT rate `np` | 1 × 200.00 @ np | `vat=0.00` |
| Zero-VAT rate `oo` | 1 × 200.00 @ oo | `vat=0.00` |
| Zero-VAT rate `0` | 1 × 200.00 @ 0 | `vat=0.00` |
| Multi-line same rate | 2 lines @ 23% | Totals sum correctly |
| Multi-line mixed rates | 1 line @ 23%, 1 line @ 8% | Breakdown has 2 rows; totals correct |
| VAT breakdown grouping | 3 lines @ 23%, 1 line @ 8% | Breakdown: 1 row for 23%, 1 row for 8% |
| Fractional qty/price | `quantity='1.5'`, `unitNetPrice='10.00'` | `net=15.00` |
| BigInt precision | Price that would lose precision with float | Correct result (no float drift) |
| Empty lines array | `lines: []` | Throws `INVALID_INVOICE_DATA` |
| Invalid decimal format | `quantity='abc'` | Throws `INVALID_INVOICE_DATA` |

#### `assertInvoiceMathConsistency()`

| Case | Description | Expected |
|------|-------------|----------|
| Consistent totals | Totals match calculated values | Does not throw |
| Mismatched `totalNet` | Pass wrong `totalNet` | Throws mentioning `totalNet` |
| Mismatched `totalVat` | Pass wrong `totalVat` | Throws mentioning `totalVat` |
| Mismatched `totalGross` | Pass wrong `totalGross` | Throws mentioning `totalGross` |
| Multiple mismatches | All totals wrong | Throws listing all mismatches |

---

### 5. FA(3) XML Parser — `packages/fa3-xml/src/parser.test.ts`

Source: `packages/fa3-xml/src/parser.ts`

#### `parseFa3Xml()`

| Case | Description | Expected |
|------|-------------|----------|
| Minimal valid XML | All required fields present | Returns correct `ParsedFa3Invoice` |
| Seller address with AdresL2 | Both address lines present | `sellerAddress = 'Line1, Line2'` |
| Seller address without AdresL2 | Only AdresL1 | `sellerAddress = 'Line1'` |
| Missing `P_2` (invoiceNumber) | Required field absent | Throws `'missing required field: invoiceNumber'` |
| Missing `P_1` (issueDate) | Required field absent | Throws `'missing required field: issueDate'` |
| Missing `P_15` (totalGross) | Required field absent | Throws `'missing required field: totalGross'` |
| Single line item | One `FaWiersz` block | `lineItems` has 1 entry with correct fields |
| Multiple line items | Three `FaWiersz` blocks | `lineItems` has 3 entries |
| totalNet summed from P_13_X | P_13_1 and P_13_2 present | `totalNet` is their sum |
| saleDate present | `P_6` tag in XML | `saleDate` extracted correctly |
| saleDate absent | No `P_6` tag | `saleDate = null` |
| Bank account present | `NrRB` in Platnosc block | `bankAccount` extracted |
| Payment method present | `FormaPlatnosci` tag | `paymentMethod` extracted |
| Due date present | `TerminPlatnosci/Termin` | `dueDate` extracted |

---

### 6. Invoice Service — `apps/api/src/services/invoice.service.test.ts`

Source: `apps/api/src/services/invoice.service.ts`

#### `assignNextInvoiceNumber()`

Mocks required: `prisma.$transaction` (executes callback with mock `tx`), `tx.$queryRaw`, `tx.company.update`

| Case | Description | Expected |
|------|-------------|----------|
| First invoice in period | `invoiceSeq = {}` | Returns `'FV 1/4/2025'`, updates seq to `{ '2025-4': 1 }` |
| Second invoice in same period | `invoiceSeq = { '2025-4': 1 }` | Returns `'FV 2/4/2025'` |
| Different period key | `invoiceSeq = { '2025-3': 5 }`, issuing in April | Returns `'FV 1/4/2025'`, March entry preserved |
| Company not found | `$queryRaw` returns `[]` | Throws `'Company ... not found'` |
| Month has no leading zero | issueDate in January | Returns `'FV 1/1/2025'` (not `'FV 1/01/2025'`) |

#### `createInvoiceDraft()`

Mocks required: `prisma.invoice.create`

| Case | Description | Expected |
|------|-------------|----------|
| Single line, totals calculated | Standard input with 1 line @ 23% | `prisma.invoice.create` called with correct `totalNet`, `totalVat`, `totalGross` |
| Default unit fallback | Line input without `unit` | `unit` defaults to `'szt'` |
| Default paymentMethod | Input without `paymentMethod` | Saved as `'BANK_TRANSFER'` |
| Optional fields absent | No `contractorId`, `saleDate`, `paymentDueDate` | Saved as `null` |

---

## What is NOT tested (and why)

| Area | Reason |
|------|--------|
| `issueInvoice()` | Requires `xmllint` subprocess (XSD validation) + Puppeteer PDF generation — integration-level only |
| `ksef.service.ts` | Requires mocking KSeF government API session flow; complex and fragile |
| `ksef-incoming.service.ts` | Same as above |
| `ocr/` pipeline | External deps: OpenRouter API, Tesseract; fire-and-forget design |
| `company-registry.service.ts` | External HTTP calls to White List / GUS APIs |
| Route handlers (most) | Auth middleware + Prisma + file upload setup adds too much overhead; service-level tests provide better coverage |
| `packages/types` | Type definitions only; no runtime logic |
| `pdf-templates` | Puppeteer + HTML rendering; output not deterministic |

---

## Run Commands

```bash
# shared-utils tests
cd packages/shared-utils && pnpm vitest run

# fa3-xml tests
cd packages/fa3-xml && pnpm vitest run

# api tests
cd apps/api && pnpm vitest run
```

---

## Conventions

- Group tests with `describe('<methodName>()')` per CLAUDE.md
- Create mocks inline per test case — no large global mock objects
- Use `as unknown as Type` for complex type assertions in tests (never `as any`)
- Use `as never` when mocking functions returning complex types
- Prefer full payload assertions (`toEqual`, `toHaveBeenCalledWith`) over partial matching

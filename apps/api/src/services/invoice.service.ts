import type { PrismaClient } from '@prisma/client';
import { calculateInvoiceTotals } from '@ksiegowy/fa3-xml';
import type { InvoiceData, InvoiceLineInput, InvoiceParty, VatRate } from '@ksiegowy/types';
import { generateInvoicePdf } from '@ksiegowy/pdf-templates';
import { buildFa3Xml, validateFa3XmlAgainstXsd } from '@ksiegowy/fa3-xml';
import crypto from 'node:crypto';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CreateInvoiceDraftInput {
  companyId: string;
  contractorId?: string;
  issueDate: string;         // YYYY-MM-DD
  saleDate?: string;
  paymentDueDate?: string;
  paymentMethod?: 'BANK_TRANSFER' | 'CASH' | 'CARD' | 'OTHER';
  currency?: string;
  notes?: string;
  lines: DraftLineInput[];
}

export interface DraftLineInput {
  position: number;
  name: string;
  unit?: string;
  quantity: string;
  unitNetPrice: string;
  vatRate: VatRate;
}

const include = { lines: true, vatBreakdown: true } as const;
type InvoiceWithRelations = Awaited<ReturnType<PrismaClient['invoice']['create']>> & {
  lines: Awaited<ReturnType<PrismaClient['invoiceLine']['findMany']>>;
  vatBreakdown: Awaited<ReturnType<PrismaClient['invoiceVatBreakdown']['findMany']>>;
};

// ── Invoice number assignment ──────────────────────────────────────────────────

/**
 * Resolves a pattern string to an invoice number by substituting all tokens.
 *
 * Supported tokens: {SEQ}, {YEAR}, {YEAR_SHORT}, {MONTH}, {MONTH_PAD},
 * {DAY}, {DAY_PAD}, {CONTRACTOR_NIP}
 */
const resolveInvoicePattern = (
  pattern: string,
  seq: number,
  issueDate: Date,
  contractorNip?: string | null
): string => {
  const year = issueDate.getUTCFullYear();
  const month = issueDate.getUTCMonth() + 1;
  const day = issueDate.getUTCDate();
  return pattern
    .replace('{SEQ}', String(seq))
    .replace('{YEAR}', String(year))
    .replace('{YEAR_SHORT}', String(year).slice(-2))
    .replace('{MONTH_PAD}', String(month).padStart(2, '0'))
    .replace('{MONTH}', String(month))
    .replace('{DAY_PAD}', String(day).padStart(2, '0'))
    .replace('{DAY}', String(day))
    .replace('{CONTRACTOR_NIP}', contractorNip ?? '');
};

/**
 * Derives the sequence period key from the tokens present in the pattern.
 * The key determines when the counter resets (daily / monthly / yearly / never).
 * When the pattern contains {CONTRACTOR_NIP}, the contractor NIP is included in
 * the key so each contractor gets its own independent sequential counter.
 * KOR invoices use a separate counter via the "KOR-" prefix.
 */
const getPeriodKey = (
  pattern: string,
  invoiceType: 'VAT' | 'KOR',
  issueDate: Date,
  contractorNip?: string | null
): string => {
  const year = issueDate.getUTCFullYear();
  const month = issueDate.getUTCMonth() + 1;
  const day = issueDate.getUTCDate();
  const korPrefix = invoiceType === 'KOR' ? 'KOR-' : '';
  const nipSegment = pattern.includes('{CONTRACTOR_NIP}') && contractorNip ? `-${contractorNip}` : '';

  if (pattern.includes('{DAY}') || pattern.includes('{DAY_PAD}')) {
    return `${korPrefix}${year}-${month}-${day}${nipSegment}`;
  }
  if (pattern.includes('{MONTH}') || pattern.includes('{MONTH_PAD}')) {
    return `${korPrefix}${year}-${month}${nipSegment}`;
  }
  if (pattern.includes('{YEAR}') || pattern.includes('{YEAR_SHORT}')) {
    return `${korPrefix}${year}${nipSegment}`;
  }
  return `${korPrefix}global${nipSegment}`;
};

/**
 * Atomically assigns the next invoice number for the given company in the
 * given period, using SELECT FOR UPDATE on the Company row to prevent races.
 *
 * Default (pattern = null):
 *   VAT invoices: "FV {seq}/{month}/{year}"
 *   KOR invoices: "KOR {seq}/{month}/{year}" (separate sequence)
 *
 * Custom pattern: tokens are resolved from the pattern string; the period key
 * (and thus reset granularity) is derived from which date tokens are present.
 */
export const assignNextInvoiceNumber = async (
  prisma: PrismaClient,
  companyId: string,
  issueDate: Date,
  invoiceType: 'VAT' | 'KOR' = 'VAT',
  pattern: string | null = null,
  contractorNip: string | null = null
): Promise<string> => {
  const year = issueDate.getUTCFullYear();
  const month = issueDate.getUTCMonth() + 1;

  const effectivePattern = pattern ?? (invoiceType === 'KOR' ? 'KOR {SEQ}/{MONTH}/{YEAR}' : 'FV {SEQ}/{MONTH}/{YEAR}');
  const periodKey = getPeriodKey(effectivePattern, invoiceType, issueDate, contractorNip);

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ invoice_seq: unknown }>>`
      SELECT "invoiceSeq" AS invoice_seq
      FROM "Company"
      WHERE id = ${companyId}
      FOR UPDATE
    `;

    if (rows.length === 0) throw new Error(`Company ${companyId} not found`);

    const seqMap = (rows[0]!.invoice_seq ?? {}) as Record<string, number>;
    const nextSeq = (seqMap[periodKey] ?? 0) + 1;
    seqMap[periodKey] = nextSeq;

    await tx.company.update({
      where: { id: companyId },
      data: { invoiceSeq: seqMap }
    });

    if (pattern === null) {
      // Keep original format exactly as before for backwards compatibility
      const prefix = invoiceType === 'KOR' ? 'KOR' : 'FV';
      return `${prefix} ${nextSeq}/${month}/${year}`;
    }

    return resolveInvoicePattern(pattern, nextSeq, issueDate, contractorNip);
  });
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const toParty = (
  name: string,
  nip: string,
  addressLine1: string,
  addressLine2: string | null | undefined
): InvoiceParty => {
  if (addressLine2) {
    return { name, nip, addressLine1, addressLine2 };
  }
  return { name, nip, addressLine1 };
};

// ── Create draft ───────────────────────────────────────────────────────────────

export const createInvoiceDraft = async (
  prisma: PrismaClient,
  input: CreateInvoiceDraftInput
): Promise<InvoiceWithRelations> => {
  const issueDate = new Date(input.issueDate);

  const lines: InvoiceLineInput[] = input.lines.map((l) => ({
    description: l.name,
    quantity: l.quantity,
    unit: l.unit ?? 'szt',
    unitNetPrice: l.unitNetPrice,
    vatRate: l.vatRate
  }));

  const calculated = calculateInvoiceTotals({
    invoiceNumber: 'DRAFT',
    issueDate: input.issueDate,
    currency: 'PLN',
    seller: { name: '', nip: '', addressLine1: '' },
    buyer: { name: '', nip: '', addressLine1: '' },
    lines,
    totalNet: '0',
    totalVat: '0',
    totalGross: '0'
  });

  return prisma.invoice.create({
    data: {
      companyId: input.companyId,
      contractorId: input.contractorId ?? null,
      issueDate,
      saleDate: input.saleDate ? new Date(input.saleDate) : null,
      paymentDueDate: input.paymentDueDate ? new Date(input.paymentDueDate) : null,
      paymentMethod: input.paymentMethod ?? 'BANK_TRANSFER',
      currency: input.currency ?? 'PLN',
      notes: input.notes ?? null,
      totalNet: calculated.totals.net,
      totalVat: calculated.totals.vat,
      totalGross: calculated.totals.gross,
      lines: {
        create: input.lines.map((l, i) => {
          const calc = calculated.lines[i]!;
          return {
            position: l.position,
            name: l.name,
            unit: l.unit ?? 'szt',
            quantity: calc.quantity,
            unitNetPrice: calc.unitNetPrice,
            vatRate: l.vatRate,
            netValue: calc.net,
            vatValue: calc.vat,
            grossValue: calc.gross
          };
        })
      },
      vatBreakdown: {
        create: calculated.breakdown.map((b) => ({
          vatRate: b.vatRate,
          netAmount: b.net,
          vatAmount: b.vat
        }))
      }
    },
    include
  }) as Promise<InvoiceWithRelations>;
};

// ── Issue invoice ──────────────────────────────────────────────────────────────

export interface IssuedInvoiceResult {
  invoice: InvoiceWithRelations;
  pdfBuffer: Buffer;
  xmlString: string;
  pdfChecksum: string;
  xmlChecksum: string;
}

/**
 * Transitions a DRAFT invoice to ISSUED:
 * 1. Assigns an atomic invoice number
 * 2. Snapshots seller + buyer data
 * 3. Generates FA(3) XML (validates against XSD)
 * 4. Generates PDF
 * Returns buffers — caller persists to FileRecord.
 */
export const issueInvoice = async (
  prisma: PrismaClient,
  invoiceId: string,
  companyId: string
): Promise<IssuedInvoiceResult> => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId, companyId },
    include: { lines: true, vatBreakdown: true, company: true, contractor: true }
  });

  if (!invoice) throw new Error(`Invoice ${invoiceId} not found for company ${companyId}`);
  if (invoice.status !== 'DRAFT') {
    throw new Error(`Invoice ${invoiceId} is not in DRAFT status (current: ${invoice.status})`);
  }
  if (invoice.lines.length === 0) throw new Error('Invoice must have at least one line item');
  if (!invoice.contractor) throw new Error('Invoice must have a contractor before issuing');

  const { company, contractor } = invoice;
  const isKor = invoice.invoiceType === 'KOR';

  // For KOR invoices, fetch the original invoice to get its number and issue date
  let originalInvoice: { invoiceNumber: string | null; issueDate: Date } | null = null;
  if (isKor) {
    if (!invoice.correctedInvoiceId) throw new Error('KOR invoice is missing correctedInvoiceId');
    if (!invoice.correctedKsefRef) throw new Error('KOR invoice is missing correctedKsefRef (original KSeF reference)');
    originalInvoice = await prisma.invoice.findUnique({
      where: { id: invoice.correctedInvoiceId },
      select: { invoiceNumber: true, issueDate: true }
    });
    if (!originalInvoice) throw new Error(`Original invoice ${invoice.correctedInvoiceId} not found`);
    if (!originalInvoice.invoiceNumber) throw new Error('Original invoice has no invoice number');
  }

  // Assign invoice number atomically (separate KOR sequence).
  // KOR corrections always use the default format regardless of custom pattern.
  const invoiceNumber = await assignNextInvoiceNumber(
    prisma,
    companyId,
    invoice.issueDate,
    isKor ? 'KOR' : 'VAT',
    isKor ? null : (company.invoiceNumberPattern ?? null),
    contractor.nip ?? null
  );

  // Build lines for FA(3) calculation
  const invoiceLines: InvoiceLineInput[] = invoice.lines
    .sort((a, b) => a.position - b.position)
    .map((l) => ({
      description: l.name,
      quantity: l.quantity.toString(),
      unit: l.unit ?? 'szt',
      unitNetPrice: l.unitNetPrice.toString(),
      vatRate: l.vatRate as VatRate
    }));

  const seller = toParty(company.name, company.nip, company.addressLine1, company.addressLine2);
  const buyer = toParty(
    contractor.name,
    contractor.nip ?? '',
    contractor.addressLine1 ?? '',
    contractor.addressLine2
  );

  const invoiceDataForCalc: InvoiceData = {
    invoiceNumber,
    issueDate: invoice.issueDate.toISOString().slice(0, 10),
    ...(invoice.saleDate ? { saleDate: invoice.saleDate.toISOString().slice(0, 10) } : {}),
    invoiceType: isKor ? 'KOR' : 'VAT',
    currency: 'PLN',
    seller,
    buyer,
    ...(invoice.paymentMethod === 'BANK_TRANSFER' ? { paymentMethod: 'bank_transfer' as const } : { paymentMethod: 'cash' as const }),
    ...(invoice.paymentDueDate ? { paymentDueDate: invoice.paymentDueDate.toISOString().slice(0, 10) } : {}),
    ...(company.bankAccount ? { paymentBankAccount: company.bankAccount } : {}),
    ...(isKor && originalInvoice ? {
      correction: {
        originalInvoiceNumber: originalInvoice.invoiceNumber!,
        originalIssueDate: originalInvoice.issueDate.toISOString().slice(0, 10),
        originalKsefReferenceNumber: invoice.correctedKsefRef!,
        ...(invoice.correctionReason ? { reason: invoice.correctionReason } : {}),
        ...(invoice.correctionImpactType ? { impactType: invoice.correctionImpactType as '1' | '2' | '3' } : {})
      }
    } : {}),
    ...(invoice.notes ? { notes: invoice.notes } : {}),
    lines: invoiceLines,
    totalNet: '0',
    totalVat: '0',
    totalGross: '0'
  };

  const totals = calculateInvoiceTotals(invoiceDataForCalc);

  const invoiceData: InvoiceData = {
    ...invoiceDataForCalc,
    totalNet: totals.totals.net,
    totalVat: totals.totals.vat,
    totalGross: totals.totals.gross
  };

  // Validate FA(3) XML
  const xmlString = buildFa3Xml(invoiceData);
  const validationResult = validateFa3XmlAgainstXsd(xmlString);
  if (!validationResult.valid) {
    throw new Error(`FA(3) XML validation failed: ${validationResult.errors.join('; ')}`);
  }

  // Generate PDF
  const pdfBuffer = await generateInvoicePdf(invoiceData);

  // Checksums
  const pdfChecksum = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const xmlChecksum = crypto.createHash('sha256').update(xmlString).digest('hex');

  // Persist snapshot + status update
  const updatedInvoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      invoiceNumber,
      status: 'ISSUED',
      issuedAt: new Date(),
      sellerName: company.name,
      sellerNip: company.nip,
      sellerAddress1: company.addressLine1,
      sellerAddress2: company.addressLine2 ?? null,
      sellerEmail: company.email ?? null,
      sellerPhone: company.phone ?? null,
      sellerBank: company.bankName ?? null,
      sellerAccount: company.bankAccount ?? null,
      buyerName: contractor.name,
      buyerNip: contractor.nip ?? null,
      buyerAddress1: contractor.addressLine1 ?? null,
      buyerAddress2: contractor.addressLine2 ?? null,
      buyerCountry: contractor.countryCode,
      totalNet: totals.totals.net,
      totalVat: totals.totals.vat,
      totalGross: totals.totals.gross
    },
    include
  }) as InvoiceWithRelations;

  return { invoice: updatedInvoice, pdfBuffer, xmlString, pdfChecksum, xmlChecksum };
};

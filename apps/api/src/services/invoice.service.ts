import type { KsefEnvironment, Prisma, PrismaClient } from '@prisma/client';
import { calculateInvoiceTotals } from '@ksiegowy/fa3-xml';
import type { InvoiceData, InvoiceLineInput, InvoiceParty, VatRate } from '@ksiegowy/types';
import { generateInvoicePdf } from '@ksiegowy/pdf-templates';
import { buildFa3Xml, validateFa3XmlAgainstXsd } from '@ksiegowy/fa3-xml';
import crypto from 'node:crypto';
import { readAndVerifyStoredFile } from './storage/local-fs.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CreateInvoiceDraftInput {
  companyId: string;
  environment: KsefEnvironment;
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
  return prisma.$transaction((transactionClient) => assignNextInvoiceNumberInTransaction(
    transactionClient,
    companyId,
    issueDate,
    invoiceType,
    pattern,
    contractorNip,
  ));
};

const assignNextInvoiceNumberInTransaction = async (
  transactionClient: Prisma.TransactionClient,
  companyId: string,
  issueDate: Date,
  invoiceType: 'VAT' | 'KOR',
  pattern: string | null,
  contractorNip: string | null,
): Promise<string> => {
  const year = issueDate.getUTCFullYear();
  const month = issueDate.getUTCMonth() + 1;

  const effectivePattern = pattern ?? (invoiceType === 'KOR' ? 'KOR {SEQ}/{MONTH}/{YEAR}' : 'FV {SEQ}/{MONTH}/{YEAR}');
  const periodKey = getPeriodKey(effectivePattern, invoiceType, issueDate, contractorNip);

  const rows = await transactionClient.$queryRaw<Array<{ invoice_seq: unknown }>>`
      SELECT "invoiceSeq" AS invoice_seq
      FROM "Company"
      WHERE id = ${companyId}
      FOR UPDATE
    `;

  if (rows.length === 0) throw new Error(`Company ${companyId} not found`);

  const seqMap = (rows[0]!.invoice_seq ?? {}) as Record<string, number>;
  const nextSeq = (seqMap[periodKey] ?? 0) + 1;
  seqMap[periodKey] = nextSeq;

  await transactionClient.company.update({
    where: { id: companyId },
    data: { invoiceSeq: seqMap }
  });

  if (pattern === null) {
    // Keep original format exactly as before for backwards compatibility
    const prefix = invoiceType === 'KOR' ? 'KOR' : 'FV';
    return `${prefix} ${nextSeq}/${month}/${year}`;
  }

  return resolveInvoicePattern(pattern, nextSeq, issueDate, contractorNip);
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

const invoiceIssuanceInclude = {
  lines: { orderBy: { position: 'asc' as const } },
  vatBreakdown: true,
  company: true,
  contractor: true,
  correctedInvoice: {
    select: {
      companyId: true,
      environment: true,
      invoiceNumber: true,
      issueDate: true,
    },
  },
} as const;

type InvoiceForIssuance = Prisma.InvoiceGetPayload<{ include: typeof invoiceIssuanceInclude }>;
type InvoiceIssuanceReservation = InvoiceForIssuance | { recovery: 'STALE_RESET' };

const ISSUING_STALE_AFTER_MILLISECONDS = 5 * 60 * 1000;

/**
 * Invoice status semantics during issuance:
 * - DRAFT is editable and may have no invoice number.
 * - ISSUING owns its reserved invoice number while PDF/XML are generated.
 * - ISSUED is allowed only after both database records and filesystem bytes
 *   pass checksum validation.
 *
 * A stale ISSUING row is recovered only when it has no complete valid artifact
 * pair. It returns to DRAFT while keeping its reserved number, so the next
 * attempt retries deterministically without consuming another number.
 */
const hasCompleteValidIssuanceArtifacts = async (
  transactionClient: Prisma.TransactionClient,
  invoiceId: string,
  companyId: string,
): Promise<boolean> => {
  const artifactRecords = await transactionClient.fileRecord.findMany({
    where: {
      companyId,
      invoiceId,
      type: { in: ['outgoing_pdf', 'outgoing_xml'] },
    },
    select: { type: true, path: true, checksum: true, sizeBytes: true },
  });

  const validArtifacts = await Promise.all(
    ['outgoing_pdf', 'outgoing_xml'].map(async (artifactType) => {
      const matchingRecords = artifactRecords.filter((record) => record.type === artifactType);
      const validityResults = await Promise.all(
        matchingRecords.map((record) => readAndVerifyStoredFile(record)
          .then(() => true)
          .catch(() => false)),
      );

      return validityResults.some(Boolean);
    }),
  );

  return validArtifacts.every(Boolean);
};

const ensureSnapshotValue = (value: string | null, fieldName: string): string => {
  if (!value) throw new Error(`Issued invoice snapshot is missing ${fieldName}`);
  return value;
};

const buildInvoiceDataFromSnapshot = (
  invoice: InvoiceForIssuance,
): { invoiceData: InvoiceData; totals: ReturnType<typeof calculateInvoiceTotals>['totals'] } => {
  const invoiceNumber = ensureSnapshotValue(invoice.invoiceNumber, 'invoice number');
  const seller = toParty(
    ensureSnapshotValue(invoice.sellerName, 'seller name'),
    ensureSnapshotValue(invoice.sellerNip, 'seller NIP'),
    ensureSnapshotValue(invoice.sellerAddress1, 'seller address'),
    invoice.sellerAddress2,
  );
  const buyer = toParty(
    ensureSnapshotValue(invoice.buyerName, 'buyer name'),
    invoice.buyerNip ?? '',
    invoice.buyerAddress1 ?? '',
    invoice.buyerAddress2,
  );
  const invoiceLines: InvoiceLineInput[] = invoice.lines.map((line) => ({
    description: line.name,
    quantity: line.quantity.toString(),
    unit: line.unit ?? 'szt',
    unitNetPrice: line.unitNetPrice.toString(),
    vatRate: line.vatRate as VatRate,
  }));

  const isKor = invoice.invoiceType === 'KOR';
  if (isKor && !invoice.correctedKsefRef) {
    throw new Error('KOR invoice is missing correctedKsefRef (original KSeF reference)');
  }

  if (isKor && (
    !invoice.correctedInvoice ||
    invoice.correctedInvoice.companyId !== invoice.companyId ||
    invoice.correctedInvoice.environment !== invoice.environment ||
    !invoice.correctedInvoice.invoiceNumber
  )) {
    throw new Error('Original invoice is missing or belongs to another environment');
  }

  const invoiceDataForCalculation: InvoiceData = {
    invoiceNumber,
    issueDate: invoice.issueDate.toISOString().slice(0, 10),
    ...(invoice.saleDate ? { saleDate: invoice.saleDate.toISOString().slice(0, 10) } : {}),
    invoiceType: isKor ? 'KOR' : 'VAT',
    currency: 'PLN',
    seller,
    buyer,
    ...(invoice.paymentMethod === 'BANK_TRANSFER'
      ? { paymentMethod: 'bank_transfer' as const }
      : { paymentMethod: 'cash' as const }),
    ...(invoice.paymentDueDate ? { paymentDueDate: invoice.paymentDueDate.toISOString().slice(0, 10) } : {}),
    ...(invoice.sellerAccount ? { paymentBankAccount: invoice.sellerAccount } : {}),
    ...(isKor && invoice.correctedInvoice ? {
      correction: {
        originalInvoiceNumber: invoice.correctedInvoice.invoiceNumber!,
        originalIssueDate: invoice.correctedInvoice.issueDate.toISOString().slice(0, 10),
        originalKsefReferenceNumber: invoice.correctedKsefRef!,
        ...(invoice.correctionReason ? { reason: invoice.correctionReason } : {}),
        ...(invoice.correctionImpactType
          ? { impactType: invoice.correctionImpactType as '1' | '2' | '3' }
          : {}),
      },
    } : {}),
    ...(invoice.notes ? { notes: invoice.notes } : {}),
    lines: invoiceLines,
    totalNet: '0',
    totalVat: '0',
    totalGross: '0',
  };

  const totals = calculateInvoiceTotals(invoiceDataForCalculation).totals;

  return {
    invoiceData: {
      ...invoiceDataForCalculation,
      totalNet: totals.net,
      totalVat: totals.vat,
      totalGross: totals.gross,
    },
    totals,
  };
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
      environment: input.environment,
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
  invoice: InvoiceForIssuance;
  pdfBuffer: Buffer;
  xmlString: string;
  pdfChecksum: string;
  xmlChecksum: string;
}

/**
 * Reserves a draft for issuance in a short transaction, then generates the
 * immutable artifacts outside the transaction. The invoice remains ISSUING
 * until finalizeInvoiceIssuance verifies both stored artifacts.
 */
export const issueInvoice = async (
  prisma: PrismaClient,
  invoiceId: string,
  companyId: string,
  environment: KsefEnvironment,
): Promise<IssuedInvoiceResult> => {
  const reservedInvoice = await prisma.$transaction(async (transactionClient): Promise<InvoiceIssuanceReservation> => {
    const lockedInvoice = await transactionClient.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "Invoice"
      WHERE id = ${invoiceId}
        AND "companyId" = ${companyId}
        AND environment = ${environment}::"KsefEnvironment"
      FOR UPDATE
    `;

    if (lockedInvoice.length === 0) {
      throw new Error(`Invoice ${invoiceId} not found for company ${companyId}`);
    }

    const invoice = await transactionClient.invoice.findUnique({
      where: { id: invoiceId, companyId },
      include: invoiceIssuanceInclude,
    });

    if (!invoice) throw new Error(`Invoice ${invoiceId} not found for company ${companyId}`);
    if (invoice.status === 'ISSUED') {
      throw new Error(`Invoice ${invoiceId} is already ISSUED; use its stored artifacts`);
    }

    let canRetryStaleIssuingInvoice = false;
    if (invoice.status === 'ISSUING') {
      const issuingStartedAt = invoice.issuingStartedAt ?? invoice.updatedAt;
      const isStale = Date.now() - issuingStartedAt.getTime() >= ISSUING_STALE_AFTER_MILLISECONDS;

      if (!isStale) {
        throw new Error(`Invoice ${invoiceId} issuance is already in progress`);
      }

      const hasValidArtifacts = await hasCompleteValidIssuanceArtifacts(
        transactionClient,
        invoiceId,
        companyId,
      );

      if (!hasValidArtifacts) {
        await transactionClient.invoice.update({
          where: { id: invoiceId },
          data: { status: 'DRAFT', issuedAt: null, issuingStartedAt: null },
        });

        return { recovery: 'STALE_RESET' };
      }

      canRetryStaleIssuingInvoice = true;
    }

    if (invoice.status !== 'DRAFT' && !canRetryStaleIssuingInvoice) {
      throw new Error(`Invoice ${invoiceId} is not in DRAFT status (current: ${invoice.status})`);
    }
    if (invoice.lines.length === 0) throw new Error('Invoice must have at least one line item');
    if (!invoice.contractor) throw new Error('Invoice must have a contractor before issuing');

    const isKor = invoice.invoiceType === 'KOR';
    if (isKor && !invoice.correctedInvoiceId) throw new Error('KOR invoice is missing correctedInvoiceId');
    if (isKor && !invoice.correctedKsefRef) {
      throw new Error('KOR invoice is missing correctedKsefRef (original KSeF reference)');
    }
    if (isKor && (
      !invoice.correctedInvoice ||
      invoice.correctedInvoice.companyId !== companyId ||
      invoice.correctedInvoice.environment !== environment ||
      !invoice.correctedInvoice.invoiceNumber
    )) {
      throw new Error('Original invoice is missing or belongs to another environment');
    }

    // A recovered DRAFT keeps the number reserved by its earlier ISSUING run.
    const invoiceNumber = invoice.invoiceNumber ?? await assignNextInvoiceNumberInTransaction(
      transactionClient,
      companyId,
      invoice.issueDate,
      isKor ? 'KOR' : 'VAT',
      isKor ? null : (invoice.company.invoiceNumberPattern ?? null),
      invoice.contractor.nip ?? null,
    );

    return transactionClient.invoice.update({
      where: { id: invoiceId },
      data: {
        invoiceNumber,
        status: 'ISSUING',
        issuingStartedAt: new Date(),
        sellerName: invoice.company.name,
        sellerNip: invoice.company.nip,
        sellerAddress1: invoice.company.addressLine1,
        sellerAddress2: invoice.company.addressLine2 ?? null,
        sellerEmail: invoice.company.email ?? null,
        sellerPhone: invoice.company.phone ?? null,
        sellerBank: invoice.company.bankName ?? null,
        sellerAccount: invoice.company.bankAccount ?? null,
        buyerName: invoice.contractor.name,
        buyerNip: invoice.contractor.nip ?? null,
        buyerAddress1: invoice.contractor.addressLine1 ?? null,
        buyerAddress2: invoice.contractor.addressLine2 ?? null,
        buyerCountry: invoice.contractor.countryCode,
      },
      include: invoiceIssuanceInclude,
    });
  });

  if ('recovery' in reservedInvoice) {
    throw new Error(`Invoice ${invoiceId} issuance was stale and reset to DRAFT; retry issuance`);
  }

  const { invoiceData, totals } = buildInvoiceDataFromSnapshot(reservedInvoice);
  const invoiceWithTotals = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      totalNet: totals.net,
      totalVat: totals.vat,
      totalGross: totals.gross,
    },
    include: invoiceIssuanceInclude,
  });

  const xmlString = buildFa3Xml(invoiceData);
  const validationResult = validateFa3XmlAgainstXsd(xmlString);
  if (!validationResult.valid) {
    throw new Error(`FA(3) XML validation failed: ${validationResult.errors.join('; ')}`);
  }

  const pdfBuffer = await generateInvoicePdf(invoiceData);
  const pdfChecksum = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const xmlChecksum = crypto.createHash('sha256').update(xmlString).digest('hex');

  return { invoice: invoiceWithTotals, pdfBuffer, xmlString, pdfChecksum, xmlChecksum };
};

export const finalizeInvoiceIssuance = async (
  prisma: PrismaClient,
  invoiceId: string,
  companyId: string,
  environment: KsefEnvironment,
  pdfChecksum: string,
  xmlChecksum: string,
): Promise<InvoiceForIssuance> => prisma.$transaction(async (transactionClient) => {
  const lockedInvoice = await transactionClient.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT id, status
    FROM "Invoice"
    WHERE id = ${invoiceId}
      AND "companyId" = ${companyId}
      AND environment = ${environment}::"KsefEnvironment"
      FOR UPDATE
  `;

  if (lockedInvoice.length === 0) throw new Error(`Invoice ${invoiceId} not found for company ${companyId}`);

  if (lockedInvoice[0]!.status !== 'ISSUING' && lockedInvoice[0]!.status !== 'ISSUED') {
    throw new Error(`Invoice ${invoiceId} is not ready to finalize (current status: ${lockedInvoice[0]!.status})`);
  }

  const matchingFiles = await transactionClient.fileRecord.findMany({
    where: {
      companyId,
      invoiceId,
      type: { in: ['outgoing_pdf', 'outgoing_xml'] },
      checksum: { in: [pdfChecksum, xmlChecksum] },
    },
    select: { type: true, path: true, checksum: true, sizeBytes: true },
  });
  const validFiles = await Promise.all(
    matchingFiles.map(async (file) => readAndVerifyStoredFile(file)
      .then(() => file)
      .catch(() => null)),
  );
  const hasPdf = validFiles.some((file) => file?.type === 'outgoing_pdf' && file.checksum === pdfChecksum);
  const hasXml = validFiles.some((file) => file?.type === 'outgoing_xml' && file.checksum === xmlChecksum);

  if (!hasPdf || !hasXml) {
    throw new Error('Invoice artifacts are not both persisted; invoice remains ISSUING');
  }

  if (lockedInvoice[0]!.status === 'ISSUED') {
    const issuedInvoice = await transactionClient.invoice.findUnique({
      where: { id: invoiceId },
      include: invoiceIssuanceInclude,
    });
    if (!issuedInvoice) throw new Error(`Invoice ${invoiceId} not found for company ${companyId}`);
    return issuedInvoice;
  }

  return transactionClient.invoice.update({
    where: { id: invoiceId },
    data: { status: 'ISSUED', issuedAt: new Date(), issuingStartedAt: null },
    include: invoiceIssuanceInclude,
  });
});

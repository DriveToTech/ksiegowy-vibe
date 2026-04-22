import type { PrismaClient } from '@prisma/client';
import type { InvoiceData, InvoiceLineInput, InvoiceParty, VatRate } from '@ksiegowy/types';

interface StoredInvoiceAmount {
  toString(): string;
  toFixed?(fractionDigits: number): string;
}

interface StoredInvoiceLineForKsefSubmission {
  name: string;
  unit: string | null;
  quantity: StoredInvoiceAmount;
  unitNetPrice: StoredInvoiceAmount;
  vatRate: string;
}

interface StoredInvoiceCompanyForKsefSubmission {
  name: string;
  nip: string;
  addressLine1: string;
  addressLine2: string | null;
  bankAccount: string | null;
}

interface StoredInvoiceContractorForKsefSubmission {
  name: string;
  nip: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
}

export interface StoredInvoiceForKsefSubmission {
  invoiceNumber: string | null;
  issueDate: Date;
  saleDate: Date | null;
  invoiceType: string;
  paymentMethod: string;
  paymentDueDate: Date | null;
  currency: string;
  notes: string | null;
  correctionReason: string | null;
  correctionImpactType: string | null;
  correctedInvoiceId: string | null;
  correctedKsefRef: string | null;
  sellerName: string | null;
  sellerNip: string | null;
  sellerAddress1: string | null;
  sellerAddress2: string | null;
  buyerName: string | null;
  buyerNip: string | null;
  buyerAddress1: string | null;
  buyerAddress2: string | null;
  totalNet: StoredInvoiceAmount;
  totalVat: StoredInvoiceAmount;
  totalGross: StoredInvoiceAmount;
  lines: StoredInvoiceLineForKsefSubmission[];
  company: StoredInvoiceCompanyForKsefSubmission;
  contractor: StoredInvoiceContractorForKsefSubmission | null;
}

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

const formatStoredInvoiceAmount = (amount: StoredInvoiceAmount): string => {
  if (typeof amount.toFixed === 'function') {
    return amount.toFixed(2);
  }

  return Number(amount.toString()).toFixed(2);
};

export const buildIssuedInvoiceDataForKsefSubmission = async (
  prisma: PrismaClient,
  invoice: StoredInvoiceForKsefSubmission
): Promise<InvoiceData> => {
  if (!invoice.invoiceNumber) {
    throw new Error('Invoice has no invoice number assigned');
  }

  if (!invoice.contractor) {
    throw new Error('Invoice has no contractor — cannot reconstruct KSeF payload');
  }

  const invoiceLines: InvoiceLineInput[] = invoice.lines.map((line) => ({
    description: line.name,
    quantity: line.quantity.toString(),
    unit: line.unit ?? 'szt',
    unitNetPrice: line.unitNetPrice.toString(),
    vatRate: line.vatRate as VatRate
  }));

  const seller = toParty(
    invoice.sellerName ?? invoice.company.name,
    invoice.sellerNip ?? invoice.company.nip,
    invoice.sellerAddress1 ?? invoice.company.addressLine1,
    invoice.sellerAddress2 ?? invoice.company.addressLine2
  );

  const buyer = toParty(
    invoice.buyerName ?? invoice.contractor.name,
    invoice.buyerNip ?? invoice.contractor.nip ?? '',
    invoice.buyerAddress1 ?? invoice.contractor.addressLine1 ?? '',
    invoice.buyerAddress2 ?? invoice.contractor.addressLine2
  );

  const invoiceData: InvoiceData = {
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate.toISOString().slice(0, 10),
    ...(invoice.saleDate ? { saleDate: invoice.saleDate.toISOString().slice(0, 10) } : {}),
    invoiceType: invoice.invoiceType === 'KOR' ? 'KOR' : 'VAT',
    currency: 'PLN',
    seller,
    buyer,
    paymentMethod: invoice.paymentMethod === 'BANK_TRANSFER' ? 'bank_transfer' : 'cash',
    ...(invoice.paymentDueDate
      ? { paymentDueDate: invoice.paymentDueDate.toISOString().slice(0, 10) }
      : {}),
    ...(invoice.company.bankAccount ? { paymentBankAccount: invoice.company.bankAccount } : {}),
    ...(invoice.notes ? { notes: invoice.notes } : {}),
    lines: invoiceLines,
    totalNet: formatStoredInvoiceAmount(invoice.totalNet),
    totalVat: formatStoredInvoiceAmount(invoice.totalVat),
    totalGross: formatStoredInvoiceAmount(invoice.totalGross)
  };

  if (invoice.invoiceType !== 'KOR') {
    return invoiceData;
  }

  if (!invoice.correctedInvoiceId) {
    throw new Error('KOR invoice is missing correctedInvoiceId');
  }

  if (!invoice.correctedKsefRef) {
    throw new Error('KOR invoice is missing correctedKsefRef (original KSeF reference)');
  }

  const correctedInvoice = await prisma.invoice.findUnique({
    where: { id: invoice.correctedInvoiceId },
    select: { invoiceNumber: true, issueDate: true }
  });

  if (!correctedInvoice) {
    throw new Error(`Original invoice ${invoice.correctedInvoiceId} not found`);
  }

  if (!correctedInvoice.invoiceNumber) {
    throw new Error('Original invoice has no invoice number');
  }

  return {
    ...invoiceData,
    correction: {
      originalInvoiceNumber: correctedInvoice.invoiceNumber,
      originalIssueDate: correctedInvoice.issueDate.toISOString().slice(0, 10),
      originalKsefReferenceNumber: invoice.correctedKsefRef,
      ...(invoice.correctionReason ? { reason: invoice.correctionReason } : {}),
      ...(invoice.correctionImpactType
        ? { impactType: invoice.correctionImpactType as '1' | '2' | '3' }
        : {})
    }
  };
};

export type VatRate = '23' | '8' | '5' | '0' | 'zw' | 'np' | 'oo';

export type InvoicePaymentMethod = 'bank_transfer' | 'cash';

export type InvoiceType = 'VAT' | 'KOR';

export type InvoiceCorrectionImpactType = '1' | '2' | '3';

export interface InvoiceLineInput {
  readonly description: string;
  readonly quantity: string;
  readonly unit: string;
  readonly unitNetPrice: string;
  readonly vatRate: VatRate;
}

export interface InvoiceParty {
  readonly name: string;
  readonly nip: string;
  readonly addressLine1: string;
  readonly addressLine2?: string;
}

export interface InvoiceCorrectionData {
  readonly originalInvoiceNumber: string;
  readonly originalIssueDate: string;
  readonly originalKsefReferenceNumber: string;
  readonly reason?: string;
  readonly impactType?: InvoiceCorrectionImpactType;
}

export interface InvoiceData {
  readonly invoiceNumber: string;
  readonly issueDate: string;
  readonly saleDate?: string;
  readonly invoiceType?: InvoiceType;
  readonly currency: 'PLN';
  readonly seller: InvoiceParty;
  readonly buyer: InvoiceParty;
  readonly paymentDueDate?: string;
  readonly paymentMethod?: InvoicePaymentMethod;
  readonly paymentBankAccount?: string;
  readonly correction?: InvoiceCorrectionData;
  readonly notes?: string;
  readonly lines: readonly InvoiceLineInput[];
  readonly totalNet: string;
  readonly totalVat: string;
  readonly totalGross: string;
}

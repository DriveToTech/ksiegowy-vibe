export interface ExtractedInvoiceLine {
  description: string;
  quantity?: string | null;
  unit?: string | null;
  unitNetPrice?: string | null;
  vatRate?: string | null;
  netValue?: string | null;
  vatValue?: string | null;
  grossValue?: string | null;
}

export interface ExtractedInvoice {
  invoiceNumber?: string | null;
  issueDate?: string | null;        // ISO YYYY-MM-DD
  saleDate?: string | null;
  sellerName?: string | null;
  sellerNip?: string | null;        // 10 digits, no dashes
  sellerAddress?: string | null;
  buyerName?: string | null;
  buyerNip?: string | null;
  totalNet?: string | null;
  totalVat?: string | null;
  totalGross?: string | null;
  currency?: string | null;
  paymentMethod?: string | null;
  dueDate?: string | null;
  bankAccount?: string | null;
  ksefReference?: string | null;
  notes?: string | null;
  lines?: ExtractedInvoiceLine[] | null;
  confidence?: number | null;       // 0-1
  warnings?: string[] | null;
}

import { z } from 'zod';

export const ExtractedLineSchema = z.object({
  description: z.string().default(''),
  quantity: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  unitNetPrice: z.string().nullable().optional(),
  vatRate: z.string().nullable().optional(),
  netValue: z.string().nullable().optional(),
  vatValue: z.string().nullable().optional(),
  grossValue: z.string().nullable().optional(),
});

export const ExtractedInvoiceSchema = z.object({
  invoiceNumber: z.string().nullable().optional(),
  issueDate: z.string().nullable().optional(),
  saleDate: z.string().nullable().optional(),
  sellerName: z.string().nullable().optional(),
  sellerNip: z.string().nullable().optional(),
  sellerAddress: z.string().nullable().optional(),
  buyerName: z.string().nullable().optional(),
  buyerNip: z.string().nullable().optional(),
  totalNet: z.string().nullable().optional(),
  totalVat: z.string().nullable().optional(),
  totalGross: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  bankAccount: z.string().nullable().optional(),
  ksefReference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(ExtractedLineSchema).nullable().optional(),
  confidence: z.number().nullable().optional(),
  warnings: z.array(z.string()).nullable().optional(),
});

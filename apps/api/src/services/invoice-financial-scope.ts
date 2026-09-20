import type { KsefEnvironment, Prisma } from '@prisma/client';

/** Formal corrections repeat amounts; cancellation corrections carry signed amounts. */
export function issuedInvoiceFinancialScope(companyId: string, environment: KsefEnvironment): Prisma.InvoiceWhereInput {
  return { companyId, environment, status: 'ISSUED',
    OR: [{ correctionMode: null }, { correctionMode: { not: 'FORMAL' } }] };
}

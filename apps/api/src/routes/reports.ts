import type { FastifyPluginAsync } from 'fastify';
import type { AccessTokenPayload } from '../lib/auth-config.js';
import { resolveEffectiveKsefEnvironment } from '../lib/ksef-environment.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Escapes a field for CSV: wraps in quotes, doubles any internal quotes. */
const csvField = (value: string | null | undefined): string => {
  const str = value ?? '';
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const csvRow = (fields: (string | null | undefined)[]): string =>
  fields.map(csvField).join(',');

// ── Schemas ──────────────────────────────────────────────────────────────────

const companyParamsSchema = {
  type: 'object',
  properties: { companyId: { type: 'string', minLength: 1 } },
  required: ['companyId']
} as const;

const vatRegisterQuerySchema = {
  type: 'object',
  properties: {
    from: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
    to: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
    format: { type: 'string', enum: ['json', 'csv'], default: 'json' }
  }
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface CompanyParams { companyId: string }
interface VatRegisterQuery {
  from?: string;    // YYYY-MM
  to?: string;      // YYYY-MM
  format?: 'json' | 'csv';
}

// ── Plugin ───────────────────────────────────────────────────────────────────

export const reportsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  /**
   * GET /companies/:companyId/reports/vat-register
   * Returns issued invoices in the given date range with per-invoice VAT breakdown.
   * Query params: from=YYYY-MM, to=YYYY-MM, format=json|csv
   */
  fastify.get<{ Params: CompanyParams; Querystring: VatRegisterQuery }>(
    '/companies/:companyId/reports/vat-register',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: companyParamsSchema,
        querystring: vatRegisterQuerySchema
      }
    },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { companyId } = request.params;
      const { from, to, format = 'json' } = request.query;

    if (!user.companies.find((c) => c.id === companyId)) {
      throw fastify.httpErrors.forbidden('Access denied');
    }

    const selectedEnvironment = await resolveEffectiveKsefEnvironment(request, fastify.prisma, companyId);

    // Build date range filter
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (from) {
        const [year, month] = from.split('-').map(Number);
        dateFilter.gte = new Date(Date.UTC(year!, month! - 1, 1));
      }
      if (to) {
        const [year, month] = to.split('-').map(Number);
        // Last day of the to-month
        dateFilter.lte = new Date(Date.UTC(year!, month!, 0, 23, 59, 59, 999));
      }

    const invoices = await fastify.prisma.invoice.findMany({
      where: {
        companyId,
        environment: selectedEnvironment,
        status: 'ISSUED',
        ...(Object.keys(dateFilter).length > 0 ? { issueDate: dateFilter } : {})
      },
      orderBy: { issueDate: 'asc' },
      include: {
        vatBreakdown: true,
        ksefStates: {
          where: { environment: selectedEnvironment },
          select: { ksefReference: true }
        }
      }
    });

      const rows = invoices.map((invoice) => ({
        invoiceNumber: invoice.invoiceNumber ?? '',
        issueDate: invoice.issueDate.toISOString().slice(0, 10),
        buyerName: invoice.buyerName ?? '',
        buyerNip: invoice.buyerNip ?? '',
        totalNet: invoice.totalNet.toString(),
        totalVat: invoice.totalVat.toString(),
        totalGross: invoice.totalGross.toString(),
        ksefReference: invoice.ksefStates[0]?.ksefReference ?? '',
        vatBreakdown: invoice.vatBreakdown.map((b) => ({
          vatRate: b.vatRate,
          netAmount: b.netAmount.toString(),
          vatAmount: b.vatAmount.toString()
        }))
      }));

      if (format === 'csv') {
        const BOM = '\uFEFF'; // UTF-8 BOM for Excel
        const headers = csvRow([
          'Nr faktury', 'Data wystawienia', 'Nabywca', 'NIP nabywcy',
          'Netto', 'VAT', 'Brutto', 'Nr ref. KSeF',
          'Stawka VAT', 'Netto (stawka)', 'VAT (stawka)'
        ]);

        const lines: string[] = [BOM + headers];

        for (const row of rows) {
          if (row.vatBreakdown.length === 0) {
            lines.push(csvRow([
              row.invoiceNumber, row.issueDate, row.buyerName, row.buyerNip,
              row.totalNet, row.totalVat, row.totalGross, row.ksefReference,
              '', '', ''
            ]));
          } else {
            row.vatBreakdown.forEach((b, i) => {
              lines.push(csvRow([
                i === 0 ? row.invoiceNumber : '',
                i === 0 ? row.issueDate : '',
                i === 0 ? row.buyerName : '',
                i === 0 ? row.buyerNip : '',
                i === 0 ? row.totalNet : '',
                i === 0 ? row.totalVat : '',
                i === 0 ? row.totalGross : '',
                i === 0 ? row.ksefReference : '',
                b.vatRate, b.netAmount, b.vatAmount
              ]));
            });
          }
        }

        const filename = `rejestr-vat-${from ?? 'all'}-${to ?? 'all'}.csv`;
        return reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .send(lines.join('\r\n'));
      }

      return { data: rows, total: rows.length, from: from ?? null, to: to ?? null };
    }
  );
};

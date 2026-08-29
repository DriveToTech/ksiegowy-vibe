import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { generateHouseholdReportPdf, HouseholdReportPdfError } from '@ksiegowy/pdf-templates';
import {
  getHouseholdReportSummary,
  getHouseholdTaxReturnReport,
  ReportServiceError,
  type HouseholdReportSummary
} from '@ksiegowy/household-service';
import type { AccessTokenPayload } from '../../lib/auth-config.js';
import { requireHouseholdMembership } from './household-membership-guard.js';

const householdParamsSchema = {
  type: 'object', properties: { householdId: { type: 'string', minLength: 1, maxLength: 128 } }, required: ['householdId']
} as const;
const dateRangeQuerySchema = {
  type: 'object', additionalProperties: false, required: ['from', 'to'], properties: { from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' } }
} as const;
const exportQuerySchema = {
  type: 'object', additionalProperties: false, required: ['from', 'to', 'format'], properties: { from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' }, format: { type: 'string', enum: ['csv', 'pdf'] } }
} as const;

const categorySchema = {
  type: 'object', additionalProperties: false, properties: { categoryId: { type: ['string', 'null'] }, categoryName: { type: 'string' }, income: { type: 'string' }, spending: { type: 'string' } }, required: ['categoryId', 'categoryName', 'income', 'spending']
} as const;
const comparisonSchema = {
  type: 'object', additionalProperties: false, properties: { categoryName: { type: 'string' }, currentIncome: { type: 'string' }, priorIncome: { type: 'string' }, incomeDelta: { type: 'string' }, currentSpending: { type: 'string' }, priorSpending: { type: 'string' }, spendingDelta: { type: 'string' } }, required: ['categoryName', 'currentIncome', 'priorIncome', 'incomeDelta', 'currentSpending', 'priorSpending', 'spendingDelta']
} as const;
const summarySchema = {
  type: 'object', additionalProperties: false,
  properties: {
    from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' },
    cashFlow: { type: 'object', additionalProperties: false, properties: { income: { type: 'string' }, spending: { type: 'string' }, surplus: { type: 'string' }, categories: { type: 'array', items: categorySchema } }, required: ['income', 'spending', 'surplus', 'categories'] },
    categoryComparison: { type: 'object', additionalProperties: false, properties: { basis: { type: 'string', enum: ['EQUIVALENT_PRIOR_YEAR'] }, from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' }, categories: { type: 'array', items: comparisonSchema } }, required: ['basis', 'from', 'to', 'categories'] },
    netWorth: { type: 'object', additionalProperties: false, properties: {
      total: { type: 'string' }, accounts: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { accountId: { type: 'string' }, name: { type: 'string' }, value: { type: 'string' }, openingBalanceBoundary: { type: 'string', format: 'date' }, completeness: { type: 'string', enum: ['COMPLETE', 'PARTIAL'] } }, required: ['accountId', 'name', 'value', 'openingBalanceBoundary', 'completeness'] } },
      investments: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { positionId: { type: 'string' }, instrument: { type: 'string' }, wrapper: { type: 'string' }, value: { type: ['string', 'null'] }, valuationDate: { type: ['string', 'null'], format: 'date' }, completeness: { type: 'string', enum: ['COMPLETE', 'PARTIAL'] } }, required: ['positionId', 'instrument', 'wrapper', 'value', 'valuationDate', 'completeness'] } },
      components: { type: 'object', additionalProperties: false, properties: { accounts: { type: 'string' }, investments: { type: 'string' } }, required: ['accounts', 'investments'] }
    }, required: ['total', 'accounts', 'investments', 'components'] },
    dataQuality: { type: 'object', additionalProperties: false, properties: { status: { type: 'string', enum: ['COMPLETE', 'PARTIAL'] }, visibleOnly: { type: 'boolean' }, missingInvestmentValuationCount: { type: 'integer' }, accountOpeningBalanceBoundary: { type: ['string', 'null'], format: 'date' }, notes: { type: 'array', items: { type: 'string' } } }, required: ['status', 'visibleOnly', 'missingInvestmentValuationCount', 'accountOpeningBalanceBoundary', 'notes'] }
  },
  required: ['from', 'to', 'cashFlow', 'categoryComparison', 'netWorth', 'dataQuality']
} as const;
const taxReturnSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' },
    ikzeContributions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { kind: { type: 'string', enum: ['IKZE_CONTRIBUTION'] }, positionId: { type: 'string' }, instrument: { type: 'string' }, date: { type: 'string', format: 'date' }, amount: { type: 'string' } }, required: ['kind', 'positionId', 'instrument', 'date', 'amount'] } },
    totalIkzeContributions: { type: 'string' }, calculations: { type: 'object', additionalProperties: false, properties: { annualLimit: { type: 'null' }, ikzeHeadroom: { type: 'null' }, taxLiability: { type: 'null' } }, required: ['annualLimit', 'ikzeHeadroom', 'taxLiability'] }, informationalOnly: { type: 'boolean' }, notice: { type: 'string' }
  },
  required: ['from', 'to', 'ikzeContributions', 'totalIkzeContributions', 'calculations', 'informationalOnly', 'notice']
} as const;

interface HouseholdParams { householdId: string }
interface DateRangeQuery { from: string; to: string }
interface ExportQuery extends DateRangeQuery { format: 'csv' | 'pdf' }

const mapReportError = (fastify: Parameters<FastifyPluginAsync>[0], error: unknown): never => {
  if (error instanceof HouseholdReportPdfError) {
    const httpError = fastify.httpErrors.createError(error.code === 'WORKLOAD_LIMIT_EXCEEDED' ? 413 : 400, error.message);
    httpError.code = error.code;
    throw httpError;
  }
  if (!(error instanceof ReportServiceError)) throw error;
  const httpError = fastify.httpErrors.createError(error.code === 'WORKLOAD_LIMIT_EXCEEDED' ? 413 : 400, error.message);
  httpError.code = error.code;
  throw httpError;
};

const runReportOperation = async <Result>(fastify: Parameters<FastifyPluginAsync>[0], operation: () => Promise<Result>): Promise<Result> => operation().catch((error: unknown) => mapReportError(fastify, error));

const neutralizeSpreadsheetFormula = (value: string): string => {
  let position = 0;
  while (position < value.length) {
    const codePoint = value.codePointAt(position)!;
    const character = String.fromCodePoint(codePoint);
    const isLeadingIgnorable = /\s/u.test(character) || codePoint === 0xfeff || codePoint === 0x200b || codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    if (!isLeadingIgnorable) break;
    position += character.length;
  }
  return position < value.length && '=+-@'.includes(value[position]!) ? `'${value}` : value;
};
const csvField = (value: string | null | undefined, userControlled = false): string => {
  const normalizedValue = userControlled ? neutralizeSpreadsheetFormula(value ?? '') : value ?? '';
  return normalizedValue.includes(',') || normalizedValue.includes('"') || normalizedValue.includes('\n') || normalizedValue.includes('\r') ? `"${normalizedValue.replace(/"/g, '""')}"` : normalizedValue;
};
const csvRow = (values: Array<{ value: string | null | undefined; userControlled?: boolean }>): string => values.map((value) => csvField(value.value, value.userControlled)).join(',');

const buildCsv = (report: HouseholdReportSummary): string => {
  const lines = [csvRow([{ value: 'Section' }, { value: 'Name' }, { value: 'Value' }, { value: 'Value 2' }])];
  for (const category of report.cashFlow.categories) lines.push(csvRow([{ value: 'Cash flow category' }, { value: category.categoryName, userControlled: true }, { value: category.income }, { value: category.spending }]));
  for (const account of report.netWorth.accounts) lines.push(csvRow([{ value: 'Account' }, { value: account.name, userControlled: true }, { value: account.value }, { value: account.openingBalanceBoundary }]));
  for (const investment of report.netWorth.investments) lines.push(csvRow([{ value: 'Investment' }, { value: investment.instrument, userControlled: true }, { value: investment.value }, { value: investment.wrapper, userControlled: true }]));
  lines.push(csvRow([{ value: 'Total income' }, { value: report.cashFlow.income }, { value: 'Total spending' }, { value: report.cashFlow.spending }]));
  lines.push(csvRow([{ value: 'Surplus' }, { value: report.cashFlow.surplus }, { value: 'Net worth' }, { value: report.netWorth.total }]));
  return `\uFEFF${lines.join('\r\n')}`;
};

const setPrivateExportHeaders = (reply: FastifyReply, contentType: string, filename: string): void => {
  reply.header('Cache-Control', 'private, no-store').header('Content-Type', contentType).header('Content-Disposition', `attachment; filename="${filename}"`);
};

export const reportsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get<{ Params: HouseholdParams; Querystring: DateRangeQuery }>('/households/:householdId/reports/summary', {
    onRequest: [fastify.authenticate], schema: { params: householdParamsSchema, querystring: dateRangeQuerySchema, response: { 200: summarySchema } }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runReportOperation(fastify, async () => getHouseholdReportSummary(fastify.householdDatabase, request.params.householdId, user.sub, request.query));
  });

  fastify.get<{ Params: HouseholdParams; Querystring: DateRangeQuery }>('/households/:householdId/reports/tax-return', {
    onRequest: [fastify.authenticate], schema: { params: householdParamsSchema, querystring: dateRangeQuerySchema, response: { 200: taxReturnSchema } }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runReportOperation(fastify, async () => getHouseholdTaxReturnReport(fastify.householdDatabase, request.params.householdId, user.sub, request.query));
  });

  fastify.get<{ Params: HouseholdParams; Querystring: ExportQuery }>('/households/:householdId/reports/export', {
    onRequest: [fastify.authenticate], schema: { params: householdParamsSchema, querystring: exportQuerySchema }
  }, async (request, reply) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runReportOperation(fastify, async () => {
      const report = await getHouseholdReportSummary(fastify.householdDatabase, request.params.householdId, user.sub, request.query);
      if (request.query.format === 'csv') {
        setPrivateExportHeaders(reply, 'text/csv; charset=utf-8', `household-report-${request.query.from}-${request.query.to}.csv`);
        return reply.send(buildCsv(report));
      }
      const pdf = await generateHouseholdReportPdf(report);
      setPrivateExportHeaders(reply, 'application/pdf', `household-report-${request.query.from}-${request.query.to}.pdf`);
      return reply.send(pdf);
    });
  });
};

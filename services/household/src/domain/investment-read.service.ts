import { Prisma, type InvestmentPosition, type InvestmentTransaction, type PrismaClient } from '../generated/client/index.js';
import { InvestmentServiceError, listInvestmentPositions } from './investment.service.js';

export interface InvestmentValueHistoryPoint {
  transactionId: string;
  positionId: string;
  instrument: string;
  wrapper: InvestmentPosition['wrapper'];
  date: Date;
  value: Prisma.Decimal;
}

export interface InvestmentValueHistory {
  data: InvestmentValueHistoryPoint[];
  from: string | null;
  to: string | null;
  missingValuationPositionIds: string[];
}

export interface InvestmentContributionRecord {
  transaction: InvestmentTransaction;
  positionId: string;
  instrument: string;
  wrapper: InvestmentPosition['wrapper'];
}

export interface InvestmentContributions {
  data: InvestmentContributionRecord[];
  totalContribution: string;
  ikzeContribution: string;
  year: number | null;
  annualLimit: string | null;
  annualLimitSource: string | null;
  annualLimitConfirmation: 'USER_CONFIRMED' | null;
  ikzeHeadroom: string | null;
}

export interface GetInvestmentContributionsInput {
  year?: number;
  annualLimit?: string;
  annualLimitSource?: string;
  annualLimitConfirmation?: 'USER_CONFIRMED';
}

const MAX_INVESTMENT_TRANSACTION_ROWS = 5_000;

const zero = (): Prisma.Decimal => new Prisma.Decimal(0);

const assertWorkload = (actual: number, maximum: number, resourceName: string): void => {
  if (actual > maximum) throw new InvestmentServiceError('WORKLOAD_LIMIT_EXCEEDED', `${resourceName} exceeds the supported limit of ${maximum} rows`);
};

const parseDate = (value: string, fieldName: string): Date => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new InvestmentServiceError('VALIDATION_ERROR', `${fieldName} must be a valid YYYY-MM-DD date`);
  }
  return parsed;
};

const parseYear = (value: number | undefined): number | null => {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value < 2000 || value > 2100) {
    throw new InvestmentServiceError('VALIDATION_ERROR', 'year must be between 2000 and 2100');
  }
  return value;
};

const parseDecimal = (value: string, fieldName: string): Prisma.Decimal => {
  const normalizedValue = value.trim();
  if (normalizedValue.length === 0 || normalizedValue.length > 64 || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalizedValue)) {
    throw new InvestmentServiceError('VALIDATION_ERROR', `${fieldName} must be a non-negative decimal with at most 2 decimal places`);
  }
  const integerPart = normalizedValue.split('.')[0] ?? '';
  if (integerPart.length > 13) throw new InvestmentServiceError('VALIDATION_ERROR', `${fieldName} exceeds supported decimal precision`);
  return new Prisma.Decimal(normalizedValue);
};

const resolveHistoryDateFilter = (from?: string, to?: string): { fromDate: Date | null; toDate: Date | null } => {
  const fromDate = from === undefined ? null : parseDate(from, 'from');
  const toDate = to === undefined ? null : parseDate(to, 'to');
  if (fromDate !== null && toDate !== null && fromDate > toDate) throw new InvestmentServiceError('VALIDATION_ERROR', 'from must not be after to');
  return { fromDate, toDate };
};

export const getInvestmentValueHistory = async (prisma: PrismaClient, householdId: string, userId: string, from?: string, to?: string): Promise<InvestmentValueHistory> => {
  const { fromDate, toDate } = resolveHistoryDateFilter(from, to);
  const positions = await listInvestmentPositions(prisma, householdId, userId);
  if (positions.length === 0) return { data: [], from: from ?? null, to: to ?? null, missingValuationPositionIds: [] };

  const valuationTransactions = await prisma.investmentTransaction.findMany({
    where: {
      householdId,
      positionId: { in: positions.map((position) => position.id) },
      type: 'VALUATION_UPDATE',
      voidedAt: null,
      ...(fromDate !== null || toDate !== null ? { date: { ...(fromDate !== null ? { gte: fromDate } : {}), ...(toDate !== null ? { lte: toDate } : {}) } } : {})
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    take: MAX_INVESTMENT_TRANSACTION_ROWS + 1
  });
  assertWorkload(valuationTransactions.length, MAX_INVESTMENT_TRANSACTION_ROWS, 'Investment value history');
  const positionById = new Map(positions.map((position) => [position.id, position]));
  const data = valuationTransactions.flatMap((transaction) => {
    const position = positionById.get(transaction.positionId);
    return position ? [{ transactionId: transaction.id, positionId: position.id, instrument: position.instrument, wrapper: position.wrapper, date: transaction.date, value: transaction.amount }] : [];
  });

  return {
    data,
    from: from ?? null,
    to: to ?? null,
    missingValuationPositionIds: positions.filter((position) => !data.some((point) => point.positionId === position.id)).map((position) => position.id)
  };
};

export const getInvestmentContributions = async (prisma: PrismaClient, householdId: string, userId: string, input: GetInvestmentContributionsInput = {}): Promise<InvestmentContributions> => {
  const year = parseYear(input.year);
  if ((input.annualLimit !== undefined || input.annualLimitSource !== undefined || input.annualLimitConfirmation !== undefined) && year === null) {
    throw new InvestmentServiceError('VALIDATION_ERROR', 'year is required when annualLimit, annualLimitSource, or annualLimitConfirmation is supplied');
  }
  if (input.annualLimit !== undefined && input.annualLimitSource === undefined) throw new InvestmentServiceError('VALIDATION_ERROR', 'annualLimitSource is required with annualLimit');
  if (input.annualLimit === undefined && input.annualLimitSource !== undefined) throw new InvestmentServiceError('VALIDATION_ERROR', 'annualLimit is required with annualLimitSource');
  if (input.annualLimit !== undefined && input.annualLimitConfirmation !== 'USER_CONFIRMED') throw new InvestmentServiceError('VALIDATION_ERROR', 'annualLimitConfirmation must be USER_CONFIRMED');
  if (input.annualLimit === undefined && input.annualLimitConfirmation !== undefined) throw new InvestmentServiceError('VALIDATION_ERROR', 'annualLimit is required with annualLimitConfirmation');
  const annualLimitSource = input.annualLimitSource?.trim() ?? null;
  if (annualLimitSource !== null && (annualLimitSource.length === 0 || annualLimitSource.length > 300)) throw new InvestmentServiceError('VALIDATION_ERROR', 'annualLimitSource must be between 1 and 300 characters');

  const annualLimit = input.annualLimit === undefined ? null : parseDecimal(input.annualLimit, 'annualLimit');
  const annualLimitConfirmation = input.annualLimitConfirmation ?? null;
  const positions = await listInvestmentPositions(prisma, householdId, userId);
  if (positions.length === 0) {
    return { data: [], totalContribution: '0.00', ikzeContribution: '0.00', year, annualLimit: annualLimit?.toFixed(2) ?? null, annualLimitSource, annualLimitConfirmation, ikzeHeadroom: annualLimit === null ? null : annualLimit.toFixed(2) };
  }

  const transactions = await prisma.investmentTransaction.findMany({
    where: {
      householdId,
      positionId: { in: positions.map((position) => position.id) },
      type: 'CONTRIBUTION',
      voidedAt: null,
      ...(year === null ? {} : { date: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) } })
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    take: MAX_INVESTMENT_TRANSACTION_ROWS + 1
  });
  assertWorkload(transactions.length, MAX_INVESTMENT_TRANSACTION_ROWS, 'Investment contribution history');
  const positionById = new Map(positions.map((position) => [position.id, position]));
  const data = transactions.flatMap((transaction) => {
    const position = positionById.get(transaction.positionId);
    return position ? [{ transaction, positionId: position.id, instrument: position.instrument, wrapper: position.wrapper }] : [];
  });
  const totalContribution = data.reduce((total, item) => total.add(item.transaction.amount), zero());
  const ikzeContribution = data.reduce((total, item) => item.wrapper === 'IKZE' ? total.add(item.transaction.amount) : total, zero());
  const ikzeHeadroom = annualLimit !== null && year !== null ? annualLimit.sub(ikzeContribution).lt(0) ? '0.00' : annualLimit.sub(ikzeContribution).toFixed(2) : null;

  return {
    data,
    totalContribution: totalContribution.toFixed(2),
    ikzeContribution: ikzeContribution.toFixed(2),
    year,
    annualLimit: annualLimit?.toFixed(2) ?? null,
    annualLimitSource,
    annualLimitConfirmation,
    ikzeHeadroom
  };
};

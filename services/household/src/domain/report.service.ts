import { Prisma, type InvestmentPosition, type InvestmentTransaction, type HouseholdAccount, type HouseholdTransaction, type PrismaClient } from '../generated/client/index.js';
import { visibleAccountIds } from './household-account.service.js';

export type ReportServiceErrorCode = 'VALIDATION_ERROR' | 'WORKLOAD_LIMIT_EXCEEDED';

export class ReportServiceError extends Error {
  public readonly code: ReportServiceErrorCode;

  public constructor(code: ReportServiceErrorCode, message: string) {
    super(message);
    this.name = 'ReportServiceError';
    this.code = code;
  }
}

export interface HouseholdReportDateRange {
  from: string;
  to: string;
}

export interface HouseholdReportCategoryRow {
  categoryId: string | null;
  categoryName: string;
  income: string;
  spending: string;
}

export interface HouseholdReportCategoryComparisonRow {
  categoryName: string;
  currentIncome: string;
  priorIncome: string;
  incomeDelta: string;
  currentSpending: string;
  priorSpending: string;
  spendingDelta: string;
}

export interface HouseholdReportAccountComponent {
  accountId: string;
  name: string;
  value: string;
  openingBalanceBoundary: string;
  completeness: 'COMPLETE' | 'PARTIAL';
}

export interface HouseholdReportInvestmentComponent {
  positionId: string;
  instrument: string;
  wrapper: string;
  value: string | null;
  valuationDate: string | null;
  completeness: 'COMPLETE' | 'PARTIAL';
}

export interface HouseholdReportSummary {
  from: string;
  to: string;
  cashFlow: {
    income: string;
    spending: string;
    surplus: string;
    categories: HouseholdReportCategoryRow[];
  };
  categoryComparison: {
    basis: 'EQUIVALENT_PRIOR_YEAR';
    from: string;
    to: string;
    categories: HouseholdReportCategoryComparisonRow[];
  };
  netWorth: {
    total: string;
    accounts: HouseholdReportAccountComponent[];
    investments: HouseholdReportInvestmentComponent[];
    components: { accounts: string; investments: string };
  };
  dataQuality: {
    status: 'COMPLETE' | 'PARTIAL';
    visibleOnly: true;
    missingInvestmentValuationCount: number;
    accountOpeningBalanceBoundary: string | null;
    notes: string[];
  };
}

export interface HouseholdTaxReturnEvidence {
  kind: 'IKZE_CONTRIBUTION';
  positionId: string;
  instrument: string;
  date: string;
  amount: string;
}

export interface HouseholdTaxReturnReport {
  from: string;
  to: string;
  ikzeContributions: HouseholdTaxReturnEvidence[];
  totalIkzeContributions: string;
  calculations: {
    annualLimit: null;
    ikzeHeadroom: null;
    taxLiability: null;
  };
  informationalOnly: true;
  notice: string;
}

interface ParsedReportDateRange {
  from: string;
  to: string;
  fromDate: Date;
  toDate: Date;
  priorFromDate: Date;
  priorToDate: Date;
}

type TransactionWithCategory = HouseholdTransaction & { category: { id: string; name: string; cashFlowTreatment: string } | null };
type PositionWithTransactions = InvestmentPosition & { transactions: InvestmentTransaction[] };

const MAX_REPORT_ACCOUNTS = 200;
const MAX_REPORT_LEDGER_ROWS = 10_000;
const MAX_REPORT_POSITIONS = 200;
const MAX_REPORT_INVESTMENT_ROWS_PER_POSITION = 1_000;
const MAX_REPORT_TAX_EVIDENCE_ROWS = 5_000;
const MAX_REPORT_TEXT_LENGTH = 160;

const zero = (): Prisma.Decimal => new Prisma.Decimal(0);

const assertWorkload = (actual: number, maximum: number, resourceName: string): void => {
  if (actual > maximum) throw new ReportServiceError('WORKLOAD_LIMIT_EXCEEDED', `${resourceName} exceeds the supported limit of ${maximum} rows`);
};

const assertReportTextLength = (value: string, fieldName: string): void => {
  if (value.length > MAX_REPORT_TEXT_LENGTH) throw new ReportServiceError('VALIDATION_ERROR', `${fieldName} must be at most ${MAX_REPORT_TEXT_LENGTH} characters`);
};

const parseDate = (value: string, fieldName: string): Date => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ReportServiceError('VALIDATION_ERROR', `${fieldName} must be a valid YYYY-MM-DD date`);
  }
  return parsed;
};

const shiftYear = (date: Date, years: number): Date => {
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const shifted = new Date(Date.UTC(date.getUTCFullYear() + years, month, day));
  if (shifted.getUTCMonth() !== month) return new Date(Date.UTC(date.getUTCFullYear() + years, month + 1, 0));
  return shifted;
};

const parseDateRange = (input: HouseholdReportDateRange): ParsedReportDateRange => {
  const fromDate = parseDate(input.from, 'from');
  const toDate = parseDate(input.to, 'to');
  if (fromDate > toDate) throw new ReportServiceError('VALIDATION_ERROR', 'from must not be after to');
  const maximumToDate = new Date(Date.UTC(fromDate.getUTCFullYear() + 1, fromDate.getUTCMonth(), fromDate.getUTCDate()));
  if (toDate >= maximumToDate) throw new ReportServiceError('VALIDATION_ERROR', 'Report range cannot exceed one year');
  return {
    from: input.from,
    to: input.to,
    fromDate,
    toDate,
    priorFromDate: shiftYear(fromDate, -1),
    priorToDate: shiftYear(toDate, -1)
  };
};

const dateEnd = (date: Date): Date => new Date(`${dateKey(date)}T23:59:59.999Z`);
const dateKey = (date: Date): string => date.toISOString().slice(0, 10);

const addCategoryAmount = (map: Map<string, { categoryId: string | null; categoryName: string; income: Prisma.Decimal; spending: Prisma.Decimal }>, transaction: TransactionWithCategory): void => {
  if (transaction.transferGroupId !== null || transaction.category?.cashFlowTreatment === 'TRANSFER') return;
  const categoryId = transaction.category?.id ?? null;
  const categoryName = transaction.category?.name ?? 'Uncategorized';
  const key = categoryId ?? 'uncategorized';
  const current = map.get(key) ?? { categoryId, categoryName, income: zero(), spending: zero() };
  if (transaction.amount.gte(0)) current.income = current.income.add(transaction.amount);
  else current.spending = current.spending.add(transaction.amount.abs());
  map.set(key, current);
};

const categoryRows = (map: Map<string, { categoryId: string | null; categoryName: string; income: Prisma.Decimal; spending: Prisma.Decimal }>): HouseholdReportCategoryRow[] =>
  [...map.values()].sort((left, right) => left.categoryName.localeCompare(right.categoryName)).map((category) => ({
    categoryId: category.categoryId,
    categoryName: category.categoryName,
    income: category.income.toFixed(2),
    spending: category.spending.toFixed(2)
  }));

const calculateAccountComponents = (accounts: HouseholdAccount[], transactions: TransactionWithCategory[], toDate: Date): HouseholdReportAccountComponent[] => {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const amountByAccountId = new Map<string, Prisma.Decimal>();
  for (const transaction of transactions) {
    const account = accountById.get(transaction.accountId);
    if (!account || transaction.date > toDate || dateKey(transaction.date) < dateKey(account.createdAt)) continue;
    amountByAccountId.set(transaction.accountId, (amountByAccountId.get(transaction.accountId) ?? zero()).add(transaction.amount));
  }
  return accounts.map((account) => ({
    accountId: account.id,
    name: account.name,
    value: account.openingBalance.add(amountByAccountId.get(account.id) ?? zero()).toFixed(2),
    openingBalanceBoundary: dateKey(account.createdAt),
    completeness: dateKey(account.createdAt) <= dateKey(toDate) ? 'COMPLETE' : 'PARTIAL'
  }));
};

const latestValuation = (transactions: InvestmentTransaction[]): InvestmentTransaction | null => {
  const valuations = transactions.filter((transaction) => transaction.type === 'VALUATION_UPDATE' && transaction.voidedAt === null);
  return valuations.length === 0 ? null : valuations[valuations.length - 1]!;
};

const calculateInvestmentComponents = (positions: PositionWithTransactions[]): HouseholdReportInvestmentComponent[] =>
  positions.map((position) => {
    const valuation = latestValuation(position.transactions);
    return {
      positionId: position.id,
      instrument: position.instrument,
      wrapper: position.wrapper,
      value: valuation?.amount.toFixed(2) ?? null,
      valuationDate: valuation ? dateKey(valuation.date) : null,
      completeness: valuation === null ? 'PARTIAL' : 'COMPLETE'
    };
  });

const reportTransactions = (transactions: TransactionWithCategory[], fromDate: Date, toDate: Date): TransactionWithCategory[] =>
  transactions.filter((transaction) => transaction.date >= fromDate && transaction.date <= toDate);

const buildCategoryComparison = (transactions: TransactionWithCategory[], range: ParsedReportDateRange): HouseholdReportCategoryComparisonRow[] => {
  const current = new Map<string, { currentIncome: Prisma.Decimal; currentSpending: Prisma.Decimal; priorIncome: Prisma.Decimal; priorSpending: Prisma.Decimal }>();
  const add = (name: string, field: 'currentIncome' | 'currentSpending' | 'priorIncome' | 'priorSpending', amount: Prisma.Decimal): void => {
    const row = current.get(name) ?? { currentIncome: zero(), currentSpending: zero(), priorIncome: zero(), priorSpending: zero() };
    row[field] = row[field].add(amount);
    current.set(name, row);
  };

  for (const transaction of transactions) {
    if (transaction.transferGroupId !== null || transaction.category?.cashFlowTreatment === 'TRANSFER') continue;
    const name = transaction.category?.name ?? 'Uncategorized';
    const isCurrent = transaction.date >= range.fromDate && transaction.date <= range.toDate;
    const isPrior = transaction.date >= range.priorFromDate && transaction.date <= range.priorToDate;
    if (!isCurrent && !isPrior) continue;
    const field = transaction.amount.gte(0) ? isCurrent ? 'currentIncome' : 'priorIncome' : isCurrent ? 'currentSpending' : 'priorSpending';
    add(name, field, transaction.amount.abs());
  }

  return [...current.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([categoryName, row]) => ({
    categoryName,
    currentIncome: row.currentIncome.toFixed(2),
    priorIncome: row.priorIncome.toFixed(2),
    incomeDelta: row.currentIncome.sub(row.priorIncome).toFixed(2),
    currentSpending: row.currentSpending.toFixed(2),
    priorSpending: row.priorSpending.toFixed(2),
    spendingDelta: row.currentSpending.sub(row.priorSpending).toFixed(2)
  }));
};

const loadReportData = async (prisma: PrismaClient, householdId: string, userId: string, range: ParsedReportDateRange): Promise<{
  accounts: HouseholdAccount[];
  transactions: TransactionWithCategory[];
  positions: PositionWithTransactions[];
}> => {
  const accountIds = await visibleAccountIds(prisma, householdId, userId, MAX_REPORT_ACCOUNTS + 1);
  assertWorkload(accountIds.length, MAX_REPORT_ACCOUNTS, 'Report accounts');
  const [accounts, transactions, positions] = await Promise.all([
    accountIds.length === 0 ? Promise.resolve([] as HouseholdAccount[]) : prisma.householdAccount.findMany({ where: { householdId, id: { in: accountIds }, createdAt: { lte: dateEnd(range.toDate) } }, take: MAX_REPORT_ACCOUNTS + 1 }),
    accountIds.length === 0 ? Promise.resolve([] as TransactionWithCategory[]) : prisma.householdTransaction.findMany({
      where: { householdId, accountId: { in: accountIds }, date: { lte: range.toDate } },
      include: { category: { select: { id: true, name: true, cashFlowTreatment: true } } },
      orderBy: { date: 'asc' },
      take: MAX_REPORT_LEDGER_ROWS + 1
    }),
    prisma.investmentPosition.findMany({
      where: {
        householdId,
        createdAt: { lte: dateEnd(range.toDate) },
        OR: [{ visibility: 'SHARED' }, { visibility: 'PRIVATE', ownerUserId: userId }],
        AND: [{ OR: [{ archivedAt: null }, { archivedAt: { gt: dateEnd(range.toDate) } }] }]
      },
      include: {
        transactions: {
          where: { date: { lte: range.toDate } },
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          take: MAX_REPORT_INVESTMENT_ROWS_PER_POSITION + 1
        }
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_REPORT_POSITIONS + 1
    })
  ]);
  assertWorkload(accounts.length, MAX_REPORT_ACCOUNTS, 'Report accounts');
  assertWorkload(transactions.length, MAX_REPORT_LEDGER_ROWS, 'Report ledger rows');
  assertWorkload(positions.length, MAX_REPORT_POSITIONS, 'Report investment positions');
  for (const position of positions) assertWorkload(position.transactions.length, MAX_REPORT_INVESTMENT_ROWS_PER_POSITION, 'Report investment transaction rows');
  for (const account of accounts) assertReportTextLength(account.name, 'Account name');
  for (const position of positions) assertReportTextLength(position.instrument, 'Investment instrument');
  for (const transaction of transactions) if (transaction.category) assertReportTextLength(transaction.category.name, 'Category name');
  return { accounts, transactions, positions };
};

export const getHouseholdReportSummary = async (prisma: PrismaClient, householdId: string, userId: string, input: HouseholdReportDateRange): Promise<HouseholdReportSummary> => {
  const range = parseDateRange(input);
  const { accounts, transactions, positions } = await loadReportData(prisma, householdId, userId, range);
  const currentTransactions = reportTransactions(transactions, range.fromDate, range.toDate);
  const categoryMap = new Map<string, { categoryId: string | null; categoryName: string; income: Prisma.Decimal; spending: Prisma.Decimal }>();
  let income = zero();
  let spending = zero();
  for (const transaction of currentTransactions) {
    if (transaction.transferGroupId !== null || transaction.category?.cashFlowTreatment === 'TRANSFER') continue;
    if (transaction.amount.gte(0)) income = income.add(transaction.amount);
    else spending = spending.add(transaction.amount.abs());
    addCategoryAmount(categoryMap, transaction);
  }

  const accountComponents = calculateAccountComponents(accounts, transactions, range.toDate);
  const investmentComponents = calculateInvestmentComponents(positions);
  const accountTotal = accountComponents.reduce((total, account) => total.add(account.value), zero());
  const investmentTotal = investmentComponents.reduce((total, position) => position.value === null ? total : total.add(position.value), zero());
  const missingInvestmentValuationCount = investmentComponents.filter((position) => position.value === null).length;
  const openingBalanceBoundary = accountComponents.length === 0 ? null : accountComponents.map((account) => account.openingBalanceBoundary).sort()[0]!;
  const hasHistoricalAccountGap = openingBalanceBoundary !== null && range.from < openingBalanceBoundary;
  const notes = [
    'Account net worth uses opening balance plus ledger entries from the account createdAt boundary.',
    ...(missingInvestmentValuationCount > 0 ? ['One or more visible investment positions have no valuation in the report period.'] : []),
    ...(hasHistoricalAccountGap ? ['The report starts before the oldest visible account opening-balance boundary.'] : [])
  ];

  return {
    from: range.from,
    to: range.to,
    cashFlow: { income: income.toFixed(2), spending: spending.toFixed(2), surplus: income.sub(spending).toFixed(2), categories: categoryRows(categoryMap) },
    categoryComparison: { basis: 'EQUIVALENT_PRIOR_YEAR', from: dateKey(range.priorFromDate), to: dateKey(range.priorToDate), categories: buildCategoryComparison(transactions, range) },
    netWorth: {
      total: accountTotal.add(investmentTotal).toFixed(2),
      accounts: accountComponents,
      investments: investmentComponents,
      components: { accounts: accountTotal.toFixed(2), investments: investmentTotal.toFixed(2) }
    },
    dataQuality: {
      status: missingInvestmentValuationCount > 0 || hasHistoricalAccountGap ? 'PARTIAL' : 'COMPLETE',
      visibleOnly: true,
      missingInvestmentValuationCount,
      accountOpeningBalanceBoundary: openingBalanceBoundary,
      notes
    }
  };
};

export const getHouseholdTaxReturnReport = async (prisma: PrismaClient, householdId: string, userId: string, input: HouseholdReportDateRange): Promise<HouseholdTaxReturnReport> => {
  const range = parseDateRange(input);
  const positions = await prisma.investmentPosition.findMany({
    where: {
      householdId,
      OR: [{ visibility: 'SHARED' }, { visibility: 'PRIVATE', ownerUserId: userId }]
    },
    include: {
      transactions: {
        where: { type: 'CONTRIBUTION', voidedAt: null, date: { gte: range.fromDate, lte: range.toDate } },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        take: MAX_REPORT_INVESTMENT_ROWS_PER_POSITION + 1
      }
    },
    orderBy: { createdAt: 'asc' },
    take: MAX_REPORT_POSITIONS + 1
  });
  assertWorkload(positions.length, MAX_REPORT_POSITIONS, 'Tax evidence investment positions');
  assertWorkload(positions.reduce((total, position) => total + position.transactions.length, 0), MAX_REPORT_TAX_EVIDENCE_ROWS, 'Tax evidence rows');
  for (const position of positions) assertReportTextLength(position.instrument, 'Investment instrument');
  const ikzeContributions: HouseholdTaxReturnEvidence[] = [];
  for (const position of positions) {
    if (position.wrapper !== 'IKZE') continue;
    for (const transaction of position.transactions) {
      ikzeContributions.push({ kind: 'IKZE_CONTRIBUTION', positionId: position.id, instrument: position.instrument, date: dateKey(transaction.date), amount: transaction.amount.toFixed(2) });
    }
  }
  ikzeContributions.sort((left, right) => left.date.localeCompare(right.date) || left.positionId.localeCompare(right.positionId));
  const totalIkzeContributions = ikzeContributions.reduce((total, contribution) => total.add(contribution.amount), zero());
  return {
    from: range.from,
    to: range.to,
    ikzeContributions,
    totalIkzeContributions: totalIkzeContributions.toFixed(2),
    calculations: { annualLimit: null, ikzeHeadroom: null, taxLiability: null },
    informationalOnly: true,
    notice: 'Informational household records only. This report does not calculate tax, liability, eligibility, or tax advice.'
  };
};

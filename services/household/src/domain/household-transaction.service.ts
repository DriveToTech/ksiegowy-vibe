import crypto from 'node:crypto';
import { Prisma, type HouseholdTransaction, type HouseholdTransactionCategorizationSource, type PrismaClient } from '../generated/client/index.js';
import { visibleAccountIds, type HouseholdAccountWithBalance } from './household-account.service.js';
import { matchCategoryForPayee, createRule } from './categorization-rule.service.js';
import { categoryExistsInHousehold } from './household-category.service.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreateHouseholdTransactionInput {
  householdId: string;
  userId: string;
  accountId: string;
  payee: string;
  amount: string;
  date: string; // YYYY-MM-DD
  categoryId?: string;
  payerUserId?: string;
  bankDescription?: string;
  tag?: string;
  note?: string;
  isRecurring?: boolean;
  categorizationSource?: HouseholdTransactionCategorizationSource;
  importBatchId?: string;
}

export interface CreateHouseholdTransferInput {
  householdId: string;
  userId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: string; // positive amount moved
  date: string;
  payee?: string;
  note?: string;
  payerUserId?: string;
}

export interface ListHouseholdTransactionsFilter {
  accountId?: string;
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  tag?: string;
  excludeTransfers?: boolean;
  search?: string;
  direction?: 'in' | 'out';
  page?: number;
  limit?: number;
}

export interface ListHouseholdTransactionsResult {
  data: HouseholdTransaction[];
  total: number;
  page: number;
  limit: number;
  moneyIn: string;
  moneyOut: string;
}

export interface UpdateHouseholdTransactionInput {
  payee?: string;
  categoryId?: string | null;
  tag?: string | null;
  note?: string | null;
  date?: string;
}

export class HouseholdTransactionServiceError extends Error {
  public readonly code: 'TRANSACTION_NOT_FOUND' | 'TRANSACTION_IMMUTABLE' | 'ACCOUNT_NOT_FOUND' | 'CATEGORY_NOT_FOUND' | 'VALIDATION_ERROR';

  public constructor(code: 'TRANSACTION_NOT_FOUND' | 'TRANSACTION_IMMUTABLE' | 'ACCOUNT_NOT_FOUND' | 'CATEGORY_NOT_FOUND' | 'VALIDATION_ERROR', message: string) {
    super(message);
    this.name = 'HouseholdTransactionServiceError';
    this.code = code;
  }
}

export interface RecategorizeTransactionInput {
  categoryId: string;
  applyToFutureFromPayee?: boolean;
  ruleMatchType?: 'EXACT' | 'SUBSTRING';
}

export interface MonthlyInOutSummary {
  month: string; // YYYY-MM
  income: string;
  expense: string;
}

export interface HouseholdMoneySummary {
  moneyIn: string;
  moneyOut: string;
  netWorth: string;
  netWorthChangePercent: string;
  savingsRatePercent: string;
  savingsAmountThisMonth: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const assertVisibleAccount = async (
  prisma: PrismaClient,
  householdId: string,
  accountId: string,
  userId: string
): Promise<void> => {
  const accountIds = await visibleAccountIds(prisma, householdId, userId);
  if (!accountIds.includes(accountId)) throw new HouseholdTransactionServiceError('ACCOUNT_NOT_FOUND', 'Account not found');
};

const findVisibleTransaction = async (prisma: PrismaClient, householdId: string, userId: string, transactionId: string): Promise<HouseholdTransaction> => {
  const accountIds = await visibleAccountIds(prisma, householdId, userId);
  const transaction = await prisma.householdTransaction.findFirst({ where: { id: transactionId, householdId, accountId: { in: accountIds } } });
  if (!transaction) throw new HouseholdTransactionServiceError('TRANSACTION_NOT_FOUND', 'Transaction not found');
  return transaction;
};

// ── Create ───────────────────────────────────────────────────────────────────

/**
 * Creates a single ledger transaction. When categoryId is omitted, applies
 * the household's categorization rules (exact-then-longest-substring
 * precedence) before falling back to uncategorized.
 */
export const createTransaction = async (
  prisma: PrismaClient,
  input: CreateHouseholdTransactionInput
): Promise<HouseholdTransaction> => {
  await assertVisibleAccount(prisma, input.householdId, input.accountId, input.userId);

  let categoryId = input.categoryId ?? null;
  let categorizationSource: HouseholdTransactionCategorizationSource = input.categorizationSource ?? 'MANUAL';

  if (!categoryId) {
    const matchedCategoryId = await matchCategoryForPayee(prisma, input.householdId, input.payee);
    if (matchedCategoryId) {
      categoryId = matchedCategoryId;
      categorizationSource = 'RULE';
    }
  }
  if (categoryId && !(await categoryExistsInHousehold(prisma, input.householdId, categoryId))) {
    throw new HouseholdTransactionServiceError('CATEGORY_NOT_FOUND', 'Category not found');
  }

  return prisma.householdTransaction.create({
    data: {
      householdId: input.householdId,
      accountId: input.accountId,
      categoryId,
      payee: input.payee,
      payerUserId: input.userId,
      bankDescription: input.bankDescription ?? null,
      amount: input.amount,
      date: new Date(input.date),
      tag: input.tag ?? null,
      note: input.note ?? null,
      isRecurring: input.isRecurring ?? false,
      categorizationSource,
      importBatchId: input.importBatchId ?? null
    }
  });
};

/**
 * Creates a transfer between two household accounts as two linked rows
 * sharing transferGroupId (negative on the source, positive on the
 * destination) rather than a type enum, so every SUM(amount) aggregate keeps
 * working with one added `transferGroupId IS NULL` predicate.
 */
export const createTransfer = async (
  prisma: PrismaClient,
  input: CreateHouseholdTransferInput
): Promise<[HouseholdTransaction, HouseholdTransaction]> => {
  if (input.fromAccountId === input.toAccountId) {
    throw new Error('Transfer source and destination accounts must be different');
  }

  await assertVisibleAccount(prisma, input.householdId, input.fromAccountId, input.userId);
  await assertVisibleAccount(prisma, input.householdId, input.toAccountId, input.userId);

  const transferGroupId = crypto.randomUUID();
  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(input.amount).abs();
  } catch {
    throw new HouseholdTransactionServiceError('VALIDATION_ERROR', 'amount must be a valid decimal amount');
  }
  if (!amount.isFinite() || amount.lte(0)) throw new HouseholdTransactionServiceError('VALIDATION_ERROR', 'amount must be greater than zero');
  const date = new Date(input.date);
  const payee = input.payee ?? 'Transfer';

  return prisma.$transaction([
    prisma.householdTransaction.create({
      data: {
        householdId: input.householdId,
        accountId: input.fromAccountId,
        payee,
        amount: amount.negated(),
        date,
        note: input.note ?? null,
        payerUserId: input.userId,
        transferGroupId
      }
    }),
    prisma.householdTransaction.create({
      data: {
        householdId: input.householdId,
        accountId: input.toAccountId,
        payee,
        amount,
        date,
        note: input.note ?? null,
        payerUserId: input.userId,
        transferGroupId
      }
    })
  ]) as Promise<[HouseholdTransaction, HouseholdTransaction]>;
};

// ── Listing ──────────────────────────────────────────────────────────────────

/**
 * Lists ledger transactions matching the given filter, paginated. `total`,
 * `moneyIn` and `moneyOut` are computed over every matching transaction (not
 * just the returned page), so pagination controls and the ledger's in/out
 * footer stay consistent with each other from a single call. The full
 * matching set is fetched once (amount only, no `data` duplication) rather
 * than run a separate COUNT/SUM query, keeping this to two queries total.
 */
export const listTransactions = async (
  prisma: PrismaClient,
  householdId: string,
  userId: string,
  filter: ListHouseholdTransactionsFilter = {}
): Promise<ListHouseholdTransactionsResult> => {
  const accountIds = await visibleAccountIds(prisma, householdId, userId);
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;

  if (accountIds.length === 0) {
    return { data: [], total: 0, page, limit, moneyIn: '0.00', moneyOut: '0.00' };
  }

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (filter.dateFrom) dateFilter.gte = new Date(filter.dateFrom);
  if (filter.dateTo) dateFilter.lte = new Date(filter.dateTo);

  const search = filter.search?.trim();
  const searchedAmount = search ? Number(search.replace(',', '.')) : NaN;

  if (filter.accountId && !accountIds.includes(filter.accountId)) {
    return { data: [], total: 0, page, limit, moneyIn: '0.00', moneyOut: '0.00' };
  }

  const where = {
    householdId,
    accountId: filter.accountId ? filter.accountId : { in: accountIds },
    ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
    ...(filter.tag ? { tag: filter.tag } : {}),
    ...(filter.excludeTransfers ? { transferGroupId: null } : {}),
    ...(filter.direction === 'in' ? { amount: { gte: '0' } } : {}),
    ...(filter.direction === 'out' ? { amount: { lt: '0' } } : {}),
    ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
    ...(search
      ? {
          OR: [
            { payee: { contains: search, mode: 'insensitive' as const } },
            { note: { contains: search, mode: 'insensitive' as const } },
            { bankDescription: { contains: search, mode: 'insensitive' as const } },
            ...(Number.isFinite(searchedAmount) ? [{ amount: searchedAmount.toString() }, { amount: (-searchedAmount).toString() }] : [])
          ]
        }
      : {})
  };

  const [data, matchingTransactions] = await Promise.all([
    prisma.householdTransaction.findMany({
      where,
      orderBy: { date: 'desc' },
      take: limit,
      skip: (page - 1) * limit
    }),
    prisma.householdTransaction.findMany({ where, select: { amount: true, transferGroupId: true } })
  ]);

  // moneyIn/moneyOut are an income/expense aggregate, so transfer legs are
  // always excluded regardless of the `excludeTransfers` row-display filter —
  // a transfer between your own accounts is not income or spending.
  let moneyIn = new Prisma.Decimal(0);
  let moneyOut = new Prisma.Decimal(0);
  for (const transaction of matchingTransactions) {
    if (transaction.transferGroupId) continue;
    if (transaction.amount.gte(0)) {
      moneyIn = moneyIn.add(transaction.amount);
    } else {
      moneyOut = moneyOut.add(transaction.amount.abs());
    }
  }

  return { data, total: matchingTransactions.length, page, limit, moneyIn: moneyIn.toFixed(2), moneyOut: moneyOut.toFixed(2) };
};

export const getVisibleTransaction = async (
  prisma: PrismaClient,
  householdId: string,
  userId: string,
  transactionId: string
): Promise<HouseholdTransaction | null> => {
  const accountIds = await visibleAccountIds(prisma, householdId, userId);
  const transaction = await prisma.householdTransaction.findFirst({ where: { id: transactionId, householdId } });

  if (!transaction || !accountIds.includes(transaction.accountId)) {
    return null;
  }

  return transaction;
};

// ── Update / recategorize ────────────────────────────────────────────────────

export const updateTransaction = async (
  prisma: PrismaClient,
  householdId: string,
  transactionId: string,
  userId: string,
  input: UpdateHouseholdTransactionInput
): Promise<HouseholdTransaction> => {
  const transaction = await findVisibleTransaction(prisma, householdId, userId, transactionId);
  if (transaction.goalMovementId) {
    throw new HouseholdTransactionServiceError('TRANSACTION_IMMUTABLE', 'Goal movement ledger entries are immutable');
  }

  const data: Record<string, string | Date | null> = {};
  if (input.payee !== undefined) data.payee = input.payee;
  if ('categoryId' in input) {
    if (input.categoryId !== null && !(await categoryExistsInHousehold(prisma, householdId, input.categoryId))) {
      throw new HouseholdTransactionServiceError('CATEGORY_NOT_FOUND', 'Category not found');
    }
    data.categoryId = input.categoryId ?? null;
  }
  if ('tag' in input) data.tag = input.tag ?? null;
  if ('note' in input) data.note = input.note ?? null;
  if (input.date !== undefined) data.date = new Date(input.date);

  return prisma.householdTransaction.update({ where: { id: transactionId }, data });
};

/**
 * Recategorizes one transaction. Only creates a categorization rule when the
 * caller explicitly opts in ("also apply to future transactions from this
 * payee") — never automatically, so one correction never silently redirects
 * every future purchase from that payee.
 */
export const recategorizeTransaction = async (
  prisma: PrismaClient,
  householdId: string,
  transactionId: string,
  userId: string,
  input: RecategorizeTransactionInput
): Promise<HouseholdTransaction> => {
  const transaction = await findVisibleTransaction(prisma, householdId, userId, transactionId);
  if (transaction.goalMovementId) {
    throw new HouseholdTransactionServiceError('TRANSACTION_IMMUTABLE', 'Goal movement ledger entries are immutable');
  }
  if (!(await categoryExistsInHousehold(prisma, householdId, input.categoryId))) {
    throw new HouseholdTransactionServiceError('CATEGORY_NOT_FOUND', 'Category not found');
  }

  const updated = await prisma.householdTransaction.update({
    where: { id: transactionId },
    data: { categoryId: input.categoryId, categorizationSource: 'MANUAL' }
  });

  if (input.applyToFutureFromPayee) {
    await createRule(prisma, {
      householdId,
      matchType: input.ruleMatchType ?? 'EXACT',
      payeePattern: transaction.payee,
      categoryId: input.categoryId
    });
  }

  return updated;
};

// ── Delete ───────────────────────────────────────────────────────────────────

/**
 * Deletes a transaction. When it's one leg of a transfer, both linked rows
 * are deleted together — a lone transfer leg would silently unbalance the
 * accounts it moved money between.
 */
export const deleteTransaction = async (prisma: PrismaClient, householdId: string, transactionId: string, userId: string): Promise<void> => {
  const transaction = await findVisibleTransaction(prisma, householdId, userId, transactionId);
  if (transaction.goalMovementId) {
    throw new HouseholdTransactionServiceError('TRANSACTION_IMMUTABLE', 'Goal movement ledger entries are immutable');
  }

  const sourceMovement = await prisma.goalMovement.findFirst({ where: { householdId, sourceTransactionId: transactionId }, select: { id: true } });
  if (sourceMovement) {
    throw new HouseholdTransactionServiceError('TRANSACTION_IMMUTABLE', 'Transactions referenced by goal movements are immutable');
  }

  if (transaction.transferGroupId) {
    const accountIds = await visibleAccountIds(prisma, householdId, userId);
    const transferLegs = await prisma.householdTransaction.findMany({ where: { householdId, transferGroupId: transaction.transferGroupId }, select: { accountId: true, goalMovementId: true } });
    if (transferLegs.some((leg) => !accountIds.includes(leg.accountId) || leg.goalMovementId)) {
      throw new HouseholdTransactionServiceError('TRANSACTION_IMMUTABLE', 'The linked transfer cannot be modified');
    }
    await prisma.householdTransaction.deleteMany({ where: { transferGroupId: transaction.transferGroupId } });
    return;
  }

  await prisma.householdTransaction.delete({ where: { id: transactionId } });
};

// ── Reporting ────────────────────────────────────────────────────────────────

/**
 * Feeds the dashboard's 6-month in/out chart. Excludes transfers (same
 * transferGroupId IS NULL predicate as every other income/expense aggregate)
 * and is scoped to the accounts visible to the requesting user. Anchored on
 * the current month unless `anchorMonth` (YYYY-MM) is given — the last entry
 * of the returned array is always the anchor month, so dashboard callers can
 * read this month's totals off the tail instead of running a second query.
 */
export const getMonthlyInOutSummary = async (
  prisma: PrismaClient,
  householdId: string,
  userId: string,
  monthsBack = 6,
  anchorMonth?: string
): Promise<MonthlyInOutSummary[]> => {
  const accountIds = await visibleAccountIds(prisma, householdId, userId);
  if (accountIds.length === 0) {
    return [];
  }

  const now = new Date();
  const [anchorYear, anchorMonthNumber] = anchorMonth
    ? anchorMonth.split('-').map(Number)
    : [now.getUTCFullYear(), now.getUTCMonth() + 1];

  const rangeStart = new Date(Date.UTC(anchorYear!, anchorMonthNumber! - 1 - (monthsBack - 1), 1));

  const transactions = await prisma.householdTransaction.findMany({
    where: {
      householdId,
      accountId: { in: accountIds },
      transferGroupId: null,
      date: { gte: rangeStart }
    },
    select: { amount: true, date: true }
  });

  const summaryByMonth = new Map<string, { income: Prisma.Decimal; expense: Prisma.Decimal }>();
  for (let offset = monthsBack - 1; offset >= 0; offset -= 1) {
    const monthDate = new Date(Date.UTC(anchorYear!, anchorMonthNumber! - 1 - offset, 1));
    const monthKey = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, '0')}`;
    summaryByMonth.set(monthKey, { income: new Prisma.Decimal(0), expense: new Prisma.Decimal(0) });
  }

  for (const transaction of transactions) {
    const monthKey = `${transaction.date.getUTCFullYear()}-${String(transaction.date.getUTCMonth() + 1).padStart(2, '0')}`;
    const bucket = summaryByMonth.get(monthKey);
    if (!bucket) continue;

    const amount = new Prisma.Decimal(transaction.amount);
    if (amount.gte(0)) {
      bucket.income = bucket.income.add(amount);
    } else {
      bucket.expense = bucket.expense.add(amount.abs());
    }
  }

  return Array.from(summaryByMonth.entries()).map(([month, totals]) => ({
    month,
    income: totals.income.toFixed(2),
    expense: totals.expense.toFixed(2)
  }));
};

/**
 * Derives the dashboard's headline money numbers from data the caller
 * already fetched (visible accounts with balance, and the monthly in/out
 * series) — a pure calculation, no extra database round trip.
 *
 * netWorthChangePercent has no historical balance snapshot to compare
 * against, so it's approximated as this month's net-worth-affecting flow
 * (moneyIn - moneyOut, transfers excluded) against the net worth that flow
 * implies for the start of the month (current net worth minus that flow).
 *
 * savingsRatePercent/savingsAmountThisMonth use the moneyIn - moneyOut
 * surplus definition rather than tracing transfers into savings-type
 * accounts — simpler, and correct for any household regardless of whether
 * it actually moves savings into a separate account.
 */
export const calculateMoneySummary = (
  accounts: HouseholdAccountWithBalance[],
  monthlyInOut: MonthlyInOutSummary[]
): HouseholdMoneySummary => {
  const netWorth = accounts.reduce((total, account) => total.add(account.balance), new Prisma.Decimal(0));

  const currentMonth = monthlyInOut[monthlyInOut.length - 1];
  const moneyIn = new Prisma.Decimal(currentMonth?.income ?? '0');
  const moneyOut = new Prisma.Decimal(currentMonth?.expense ?? '0');
  const savingsAmountThisMonth = moneyIn.sub(moneyOut);
  const netWorthAtStartOfMonth = netWorth.sub(savingsAmountThisMonth);

  return {
    moneyIn: moneyIn.toFixed(2),
    moneyOut: moneyOut.toFixed(2),
    netWorth: netWorth.toFixed(2),
    netWorthChangePercent: !netWorthAtStartOfMonth.eq(0)
      ? savingsAmountThisMonth.div(netWorthAtStartOfMonth.abs()).mul(100).toFixed(2)
      : '0.00',
    savingsRatePercent: !moneyIn.eq(0) ? savingsAmountThisMonth.div(moneyIn).mul(100).toFixed(2) : '0.00',
    savingsAmountThisMonth: savingsAmountThisMonth.toFixed(2)
  };
};

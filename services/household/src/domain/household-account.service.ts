import { Prisma, type HouseholdAccount, type HouseholdAccountType, type HouseholdAccountVisibility, type PrismaClient } from '../generated/client/index.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreateHouseholdAccountInput {
  householdId: string;
  userId: string;
  name: string;
  type: HouseholdAccountType;
  accountNumberMask?: string;
  visibility?: HouseholdAccountVisibility;
  openingBalance?: string;
  creditLimit?: string;
  statementDay?: number;
}

export interface UpdateHouseholdAccountInput {
  name?: string;
  accountNumberMask?: string | null;
  creditLimit?: string | null;
  statementDay?: number | null;
}

export interface HouseholdAccountWithBalance extends HouseholdAccount {
  balance: string;
}

export class HouseholdAccountServiceError extends Error {
  public readonly code: 'ACCOUNT_NOT_FOUND' | 'VALIDATION_ERROR';

  public constructor(code: 'ACCOUNT_NOT_FOUND' | 'VALIDATION_ERROR', message: string) {
    super(message);
    this.name = 'HouseholdAccountServiceError';
    this.code = code;
  }
}

const MAX_ACCOUNT_NAME_LENGTH = 160;

const assertAccountName = (name: string): string => {
  const normalizedName = name.trim();
  if (normalizedName.length === 0) throw new HouseholdAccountServiceError('VALIDATION_ERROR', 'name is required');
  if (normalizedName.length > MAX_ACCOUNT_NAME_LENGTH) throw new HouseholdAccountServiceError('VALIDATION_ERROR', `name must be at most ${MAX_ACCOUNT_NAME_LENGTH} characters`);
  return normalizedName;
};

// ── Private-account visibility ───────────────────────────────────────────────

/**
 * The single place any query builds an account-visibility filter. Every list
 * and every aggregate (dashboard, reports, envelope spend) sources its
 * accountId-in(...) clause from this function, never re-implements the check.
 * A private account owned by someone else is omitted entirely, never returned
 * with a redacted balance.
 */
export const visibleAccountIds = async (
  prisma: PrismaClient,
  householdId: string,
  userId: string,
  maximumCount?: number
): Promise<string[]> => {
  const accounts = await prisma.householdAccount.findMany({
    where: {
      householdId,
      OR: [{ visibility: 'SHARED' }, { visibility: 'PRIVATE', ownerUserId: userId }]
    },
    select: { id: true },
    ...(maximumCount === undefined ? {} : { take: maximumCount })
  });

  return accounts.map((account) => account.id);
};

// ── Create ───────────────────────────────────────────────────────────────────

export const createAccount = async (
  prisma: PrismaClient,
  input: CreateHouseholdAccountInput
): Promise<HouseholdAccount> => {
  const visibility = input.visibility ?? 'SHARED';
  const name = assertAccountName(input.name);

  return prisma.householdAccount.create({
    data: {
      householdId: input.householdId,
      name,
      type: input.type,
      accountNumberMask: input.accountNumberMask ?? null,
      visibility,
      ownerUserId: visibility === 'PRIVATE' ? input.userId : null,
      openingBalance: input.openingBalance ?? '0',
      creditLimit: input.creditLimit ?? null,
      statementDay: input.statementDay ?? null
    }
  });
};

// ── Update ───────────────────────────────────────────────────────────────────

export const updateAccount = async (
  prisma: PrismaClient,
  householdId: string,
  accountId: string,
  userId: string,
  input: UpdateHouseholdAccountInput
): Promise<HouseholdAccount> => {
  const data: Record<string, string | number | null> = {};

  if (input.name !== undefined) data.name = input.name;
  if ('accountNumberMask' in input) data.accountNumberMask = input.accountNumberMask ?? null;
  if ('creditLimit' in input) data.creditLimit = input.creditLimit ?? null;
  if ('statementDay' in input) data.statementDay = input.statementDay ?? null;

  const accountIds = await visibleAccountIds(prisma, householdId, userId);
  const account = accountIds.includes(accountId) ? await prisma.householdAccount.findFirst({ where: { id: accountId, householdId } }) : null;
  if (!account) {
    throw new HouseholdAccountServiceError('ACCOUNT_NOT_FOUND', 'Account not found');
  }
  if (input.name !== undefined) data.name = assertAccountName(input.name);

  return prisma.householdAccount.update({ where: { id: accountId }, data });
};

// ── Balance ──────────────────────────────────────────────────────────────────

/**
 * Current balance is computed as openingBalance + SUM(HouseholdTransaction.amount)
 * rather than stored — one source of truth, no drift when an import is rolled back.
 */
const attachBalances = async (
  prisma: PrismaClient,
  accounts: HouseholdAccount[]
): Promise<HouseholdAccountWithBalance[]> => {
  if (accounts.length === 0) {
    return [];
  }

  const sums = await prisma.householdTransaction.groupBy({
    by: ['accountId'],
    where: { accountId: { in: accounts.map((account) => account.id) } },
    _sum: { amount: true }
  });

  const sumByAccountId = new Map(sums.map((row) => [row.accountId, row._sum.amount ?? new Prisma.Decimal(0)]));

  return accounts.map((account) => {
    const transactedAmount = sumByAccountId.get(account.id) ?? new Prisma.Decimal(0);
    return { ...account, balance: account.openingBalance.add(transactedAmount).toFixed(2) };
  });
};

// ── Listing ──────────────────────────────────────────────────────────────────

/**
 * Lists every account visible to the requesting user, with computed balance.
 * Backs the account picker, the household shell's nav rail, and every page
 * that needs balances outside the dashboard aggregate.
 */
export const listVisibleAccounts = async (
  prisma: PrismaClient,
  householdId: string,
  userId: string
): Promise<HouseholdAccountWithBalance[]> => {
  const accountIds = await visibleAccountIds(prisma, householdId, userId);

  if (accountIds.length === 0) {
    return [];
  }

  const accounts = await prisma.householdAccount.findMany({
    where: { id: { in: accountIds } },
    orderBy: { createdAt: 'asc' }
  });

  return attachBalances(prisma, accounts);
};

export const getVisibleAccount = async (
  prisma: PrismaClient,
  householdId: string,
  userId: string,
  accountId: string
): Promise<HouseholdAccountWithBalance | null> => {
  const accountIds = await visibleAccountIds(prisma, householdId, userId);

  if (!accountIds.includes(accountId)) {
    return null;
  }

  const account = await prisma.householdAccount.findUnique({ where: { id: accountId } });

  if (!account) {
    return null;
  }

  const [withBalance] = await attachBalances(prisma, [account]);
  return withBalance ?? null;
};

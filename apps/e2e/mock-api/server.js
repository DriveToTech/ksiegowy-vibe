// @ts-check
'use strict';

const http = require('http');
const crypto = require('crypto');

const TEST_USER = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  avatarUrl: null,
};

const TEST_COMPANY = {
  id: 'test-company-id',
  name: 'Test Company Sp. z o.o.',
  nip: '1234567890',
  addressLine1: 'ul. Testowa 1, 00-001 Warszawa',
  addressLine2: null,
  email: 'test@company.com',
  phone: null,
  bankName: null,
  bankAccount: null,
  vatStatus: 'ACTIVE',
  ksefEnv: 'TEST',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const TEST_CONTRACTOR = {
  id: 'test-contractor-id',
  companyId: 'test-company-id',
  name: 'Acme Sp. z o.o.',
  nip: '9876543210',
  pesel: null,
  addressLine1: 'ul. Przykładowa 5, 00-002 Warszawa',
  addressLine2: null,
  countryCode: 'PL',
  email: 'acme@example.com',
  phone: null,
  bankAccount: null,
  notes: null,
  isActive: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const TEST_MEMBER = {
  id: 'test-member-id',
  userId: 'test-user-id',
  companyId: 'test-company-id',
  role: 'ADMIN',
  user: TEST_USER,
  createdAt: '2024-01-01T00:00:00.000Z',
};

// ─── Household (personal mode) fixtures ─────────────────────────────────────
// Mirrors services/household's Phase 1 API contract — see apps/api/src/routes/household/*.
// Default category names match household.service.ts's DEFAULT_HOUSEHOLD_CATEGORY_NAMES
// exactly (seeded on every household, real backend included) so tests exercise real data.
const DEFAULT_HOUSEHOLD_CATEGORY_NAMES = [
  'Housing', 'Groceries', 'Transport', 'Utilities', 'Insurance', 'Health', 'Entertainment', 'Savings', 'Other',
];

const HOUSEHOLD_OWNER_TOKEN = 'household-owner-token';
const HOUSEHOLD_MEMBER_TOKEN = 'household-member-token';
const HOUSEHOLD_DATA_FAILURE_TOKEN = 'household-data-failure-token';

const TEST_HOUSEHOLD = {
  id: 'test-household-id',
  name: 'Dom Kowalskich',
  currency: 'PLN',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const TEST_HOUSEHOLD_MEMBERSHIP = {
  userId: TEST_USER.id,
  userEmail: TEST_USER.email,
  displayName: TEST_USER.name,
  role: 'OWNER',
};

// A second household member ("Anna"), used to prove a PRIVATE account owned by
// someone else is *omitted* from her accounts response, not returned redacted.
const TEST_MEMBER_ANNA = {
  userId: 'test-household-member-anna-id',
  userEmail: 'anna@example.com',
  displayName: 'Anna Kowalska',
  role: 'MEMBER',
};

const TEST_MEMBER_DATA_FAILURE = {
  userId: 'test-household-data-failure-user-id',
  userEmail: 'data-failure@example.com',
  displayName: 'Data Failure User',
  role: 'MEMBER',
};

const TEST_HOUSEHOLD_ACCOUNT_SHARED = {
  id: 'test-household-account-shared-id',
  householdId: TEST_HOUSEHOLD.id,
  name: 'Konto wspólne',
  type: 'CURRENT',
  accountNumberMask: '•••• 4417',
  visibility: 'SHARED',
  ownerUserId: null,
  openingBalance: '1000.00',
  creditLimit: null,
  statementDay: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

// Owned by TEST_USER (the OWNER token) — Anna (a different member) must never see this.
const TEST_HOUSEHOLD_ACCOUNT_PRIVATE = {
  id: 'test-household-account-private-id',
  householdId: TEST_HOUSEHOLD.id,
  name: 'Oszczędności własne',
  type: 'SAVINGS',
  accountNumberMask: null,
  visibility: 'PRIVATE',
  ownerUserId: TEST_USER.id,
  openingBalance: '500.00',
  creditLimit: null,
  statementDay: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

/**
 * @param {string} householdId
 * @returns {Array<{ id: string, householdId: string, name: string, parentCategoryId: null }>}
 */
function seedHouseholdCategories(householdId) {
  return DEFAULT_HOUSEHOLD_CATEGORY_NAMES.map((name) => ({
    id: `${householdId}-category-${name.toLowerCase()}`,
    householdId,
    name,
    parentCategoryId: null,
  }));
}

/**
 * Real Phase 1 backend doesn't auto-seed envelopes on household creation (only
 * categories + the owner membership, per household.service.ts's createHousehold).
 * There is no "add budget envelope" form anywhere in the Phase 1 frontend
 * (apps/web/src/app/household/(app)/envelopes/page.tsx only ever reads and
 * renders GET .../envelopes) — a genuinely missing feature, not a test gap. To
 * still exercise "a categorized transaction updates envelope progress on the
 * dashboard" end to end, this mock pre-seeds one Groceries envelope per
 * household, standing in for a limit a real user would have configured earlier.
 * @param {string} householdId
 * @param {string} groceriesCategoryId
 */
function seedHouseholdEnvelope(householdId, groceriesCategoryId) {
  return {
    id: `${householdId}-envelope-groceries`,
    householdId,
    categoryId: groceriesCategoryId,
    monthlyLimit: '600.00',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

/**
 * @param {{ id: string, name: string, currency?: string, ownerToken: string, ownerMember: Record<string, unknown> }} params
 */
function createHouseholdEntry({ id, name, currency, ownerToken, ownerMember, accounts = [] }) {
  const categories = seedHouseholdCategories(id);
  const groceriesCategory = categories.find((category) => category.name === 'Groceries');
  const now = new Date().toISOString();
  return {
    household: { id, name, currency: currency ?? 'PLN', createdAt: now, updatedAt: now },
    members: new Map([[ownerToken, ownerMember]]),
    categories,
    accounts,
    transactions: [],
    commitments: [],
    goals: [],
    investments: [],
    investmentTransactions: [],
    envelopes: [seedHouseholdEnvelope(id, groceriesCategory.id)],
  };
}

/** @type {Map<string, ReturnType<typeof createHouseholdEntry>>} */
const households = new Map([
  [
    TEST_HOUSEHOLD.id,
    (() => {
      const entry = createHouseholdEntry({
        id: TEST_HOUSEHOLD.id,
        name: TEST_HOUSEHOLD.name,
        ownerToken: HOUSEHOLD_OWNER_TOKEN,
        ownerMember: TEST_HOUSEHOLD_MEMBERSHIP,
        accounts: [TEST_HOUSEHOLD_ACCOUNT_SHARED, TEST_HOUSEHOLD_ACCOUNT_PRIVATE],
      });
      entry.household = TEST_HOUSEHOLD;
      entry.members.set(HOUSEHOLD_MEMBER_TOKEN, TEST_MEMBER_ANNA);
      entry.members.set(HOUSEHOLD_DATA_FAILURE_TOKEN, TEST_MEMBER_DATA_FAILURE);
      return entry;
    })(),
  ],
]);

/**
 * @param {string} householdId
 * @param {string} token
 * @returns {{ status: 200, entry: ReturnType<typeof createHouseholdEntry>, member: Record<string, unknown> } | { status: 403 | 404, body: Record<string, unknown> }}
 */
function requireHouseholdMember(householdId, token) {
  const entry = households.get(householdId);
  if (!entry) return { status: 404, body: { error: 'Not found' } };
  const member = token ? entry.members.get(token) : undefined;
  if (!member) return { status: 403, body: { error: 'Forbidden', message: 'Access denied' } };
  return { status: 200, entry, member };
}

/**
 * @param {ReturnType<typeof createHouseholdEntry>} entry
 * @param {{ id: string, accountId: string, amount: string, transferGroupId?: string | null }} transaction
 */
function accountBalance(entry, account) {
  const transactionsTotal = entry.transactions
    .filter((transaction) => transaction.accountId === account.id)
    .reduce((sum, transaction) => sum + Number.parseFloat(transaction.amount), 0);
  return (Number.parseFloat(account.openingBalance) + transactionsTotal).toFixed(2);
}

function serializeHouseholdAccount(entry, account) {
  return { ...account, balance: accountBalance(entry, account) };
}

/**
 * Accounts a given member can see: every SHARED account, plus PRIVATE accounts
 * they own themselves — a PRIVATE account owned by someone else is dropped
 * entirely from the array (omitted, not redacted), per the architecture decision.
 */
function listVisibleAccounts(entry, viewerUserId) {
  return entry.accounts
    .filter((account) => account.visibility === 'SHARED' || account.ownerUserId === viewerUserId)
    .map((account) => serializeHouseholdAccount(entry, account));
}

function isVisibleAccount(account, viewerUserId) {
  return account && (account.visibility === 'SHARED' || account.ownerUserId === viewerUserId);
}

function goalError(req, res, status, code, message) {
  return respond(req, res, status, { code, message });
}

function visibleGoals(entry, viewerUserId) {
  return entry.goals.filter((goal) => {
    const account = entry.accounts.find((candidate) => candidate.id === goal.accountId);
    return isVisibleAccount(account, viewerUserId);
  });
}

function serializeGoalAutomationRule(rule) {
  return { ...rule };
}

function serializeGoal(entry, goal) {
  const account = entry.accounts.find((candidate) => candidate.id === goal.accountId);
  return {
    id: goal.id,
    householdId: goal.householdId,
    accountId: goal.accountId,
    name: goal.name,
    description: goal.description,
    kind: goal.kind,
    status: goal.status,
    targetAmount: goal.targetAmount,
    currentAmount: goal.currentAmount,
    targetDate: goal.targetDate,
    monthlyAmount: goal.monthlyAmount,
    accountBalance: account ? accountBalance(entry, account) : '0.00',
    activeRules: goal.rules.filter((rule) => rule.isActive).map(serializeGoalAutomationRule),
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
}

function serializeGoalMovement(movement) {
  return { ...movement };
}

function serializeGoalDetail(entry, goal) {
  const movements = [...goal.movements].sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  const added = movements
    .filter((movement) => Number.parseFloat(movement.amount) >= 0)
    .reduce((sum, movement) => sum + Number.parseFloat(movement.amount), 0);
  const withdrawn = movements
    .filter((movement) => Number.parseFloat(movement.amount) < 0)
    .reduce((sum, movement) => sum + Math.abs(Number.parseFloat(movement.amount)), 0);
  return {
    goal: serializeGoal(entry, goal),
    movements: movements.slice(0, 100).map(serializeGoalMovement),
    totals: { added: added.toFixed(2), withdrawn: withdrawn.toFixed(2) },
  };
}

function findVisibleGoal(entry, goalIdentifier, viewerUserId) {
  const goal = entry.goals.find((candidate) => candidate.id === goalIdentifier);
  if (!goal) return null;
  const account = entry.accounts.find((candidate) => candidate.id === goal.accountId);
  return isVisibleAccount(account, viewerUserId) ? goal : null;
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function goalsLookbackMonths() {
  const currentDate = new Date();
  return [2, 1, 0].map((monthsAgo) => monthKey(new Date(Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth() - monthsAgo - 1, 1))));
}

function buildGoalsOverview(entry, viewerUserId) {
  const goals = visibleGoals(entry, viewerUserId);
  const activeGoals = goals.filter((goal) => goal.status === 'ACTIVE');
  const scheduledMonthlyDemand = activeGoals.reduce((sum, goal) => sum + Number.parseFloat(goal.monthlyAmount ?? '0'), 0);
  const fixedAutomationMonthlyDemand = activeGoals.reduce((sum, goal) => sum + goal.rules
    .filter((rule) => rule.isActive && rule.ruleType === 'FIXED_ON_DAY')
    .reduce((ruleSum, rule) => ruleSum + Number.parseFloat(rule.fixedAmount ?? '0'), 0), 0);
  const hasVariableRules = activeGoals.some((goal) => goal.rules.some((rule) => rule.isActive && rule.ruleType !== 'FIXED_ON_DAY'));
  const averageMonthlySurplus = 0;
  const availableForGoals = 0;

  return {
    goals: goals.map((goal) => {
      const monthlyDemand = Number.parseFloat(goal.monthlyAmount ?? '0');
      const allocation = scheduledMonthlyDemand > 0 && monthlyDemand > 0
        ? availableForGoals * monthlyDemand / scheduledMonthlyDemand
        : 0;
      const fixedAmount = goal.rules
        .filter((rule) => rule.isActive && rule.ruleType === 'FIXED_ON_DAY')
        .reduce((sum, rule) => sum + Number.parseFloat(rule.fixedAmount ?? '0'), 0);
      const headroom = goal.targetAmount === null ? 0 : Number.parseFloat(goal.targetAmount) - Number.parseFloat(goal.currentAmount);
      const forecastDate = headroom > 0 && fixedAmount > 0
        ? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + Math.ceil(headroom / fixedAmount), new Date().getUTCDate())).toISOString().slice(0, 10)
        : null;
      return {
        goal: serializeGoal(entry, goal),
        monthlyDemand: monthlyDemand.toFixed(2),
        allocation: allocation.toFixed(2),
        shortfall: Math.max(0, monthlyDemand - allocation).toFixed(2),
        forecastDate,
        forecastBasis: forecastDate ? 'FIXED_RULES_ONLY' : 'NONE',
        hasVariableRules: goal.rules.some((rule) => rule.isActive && rule.ruleType !== 'FIXED_ON_DAY'),
      };
    }),
    averageMonthlySurplus: averageMonthlySurplus.toFixed(2),
    availableForGoals: availableForGoals.toFixed(2),
    scheduledMonthlyDemand: scheduledMonthlyDemand.toFixed(2),
    fixedAutomationMonthlyDemand: fixedAutomationMonthlyDemand.toFixed(2),
    forecastBasis: goals.some((goal) => goal.rules.some((rule) => rule.isActive && rule.ruleType === 'FIXED_ON_DAY')) ? 'FIXED_RULES_ONLY' : 'NONE',
    hasVariableRules,
    lookbackMonths: goalsLookbackMonths(),
  };
}

function serializeHouseholdTransaction(transaction) {
  return {
    categoryId: null,
    payerUserId: null,
    bankDescription: null,
    tag: null,
    note: null,
    isRecurring: false,
    commitmentId: null,
    goalMovementId: null,
    categorizationSource: 'MANUAL',
    importBatchId: null,
    transferGroupId: null,
    ...transaction,
  };
}

/** Envelope spend/remaining, excluding transfers — the plan's explicit transfer-model requirement. */
function serializeHouseholdEnvelope(entry, envelope) {
  const spent = entry.transactions
    .filter((transaction) => transaction.categoryId === envelope.categoryId && !transaction.transferGroupId && Number.parseFloat(transaction.amount) < 0)
    .reduce((sum, transaction) => sum + Math.abs(Number.parseFloat(transaction.amount)), 0);
  const limit = Number.parseFloat(envelope.monthlyLimit);
  const category = entry.categories.find((candidate) => candidate.id === envelope.categoryId);
  return {
    ...envelope,
    categoryName: category ? category.name : envelope.categoryId,
    spent: spent.toFixed(2),
    remaining: (limit - spent).toFixed(2),
  };
}

/** moneyIn/moneyOut over non-transfer transactions only — transfers move money between
 * the household's own accounts and are neither income nor spending. */
function moneySummary(entry) {
  const nonTransferTransactions = entry.transactions.filter((transaction) => !transaction.transferGroupId);
  const moneyIn = nonTransferTransactions
    .filter((transaction) => Number.parseFloat(transaction.amount) > 0)
    .reduce((sum, transaction) => sum + Number.parseFloat(transaction.amount), 0);
  const moneyOut = nonTransferTransactions
    .filter((transaction) => Number.parseFloat(transaction.amount) < 0)
    .reduce((sum, transaction) => sum + Math.abs(Number.parseFloat(transaction.amount)), 0);
  return { moneyIn: moneyIn.toFixed(2), moneyOut: moneyOut.toFixed(2) };
}

function financialError(req, res, status, code, message) {
  return respond(req, res, status, { code, message });
}

function isValidCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function formatInvestmentUnits(value) {
  return value.toFixed(8).replace(/(?:\.0+|(?<=[0-9])0+)$/, '').replace(/\.$/, '') || '0';
}

function serializeInvestmentPosition(position) {
  return {
    ...position,
    units: position.units,
    costBasis: position.costBasis,
    currentValue: position.currentValue,
    targetAllocationPercent: position.targetAllocationPercent,
  };
}

function serializeInvestmentTransaction(transaction) {
  return { ...transaction };
}

function visibleInvestmentPositions(entry, viewerUserId, includeArchived = false) {
  return entry.investments.filter((position) => (includeArchived || !position.archivedAt)
    && (position.visibility === 'SHARED' || position.ownerUserId === viewerUserId));
}

function findVisibleInvestmentPosition(entry, positionId, viewerUserId) {
  return entry.investments.find((position) => position.id === positionId
    && (position.visibility === 'SHARED' || position.ownerUserId === viewerUserId)) ?? null;
}

function investmentTransactionsForPosition(entry, positionId) {
  return entry.investmentTransactions
    .filter((transaction) => transaction.positionId === positionId)
    .sort((first, second) => first.date.localeCompare(second.date)
      || first.createdAt.localeCompare(second.createdAt)
      || first.id.localeCompare(second.id));
}

function recomputeInvestmentPosition(entry, position) {
  let units = 0;
  let costBasis = 0;
  let currentValue = null;
  let lastValuedAt = null;

  for (const transaction of investmentTransactionsForPosition(entry, position.id)) {
    if (transaction.voidedAt) continue;
    const amount = Number.parseFloat(transaction.amount);
    if (transaction.type === 'BUY') {
      units += Number.parseFloat(transaction.units);
      costBasis += amount;
    } else if (transaction.type === 'SELL') {
      const soldUnits = Number.parseFloat(transaction.units);
      const averageCost = units === 0 ? 0 : costBasis / units;
      units -= soldUnits;
      costBasis = units === 0 ? 0 : costBasis - averageCost * soldUnits;
    } else if (transaction.type === 'VALUATION_UPDATE') {
      currentValue = transaction.amount;
      lastValuedAt = transaction.date;
    }
  }

  position.units = formatInvestmentUnits(units);
  position.costBasis = costBasis.toFixed(2);
  position.currentValue = currentValue;
  position.lastValuedAt = lastValuedAt;
  position.updatedAt = new Date().toISOString();
  return position;
}

function buildInvestmentPortfolio(entry, viewerUserId) {
  const positions = visibleInvestmentPositions(entry, viewerUserId);
  const valuedCurrentValue = positions.reduce((sum, position) => sum + (position.currentValue === null ? 0 : Number.parseFloat(position.currentValue)), 0);
  const missingValuationCount = positions.filter((position) => position.currentValue === null).length;
  const targets = positions.map((position) => position.targetAllocationPercent).filter((target) => target !== null);
  const targetTotal = targets.reduce((sum, target) => sum + Number.parseFloat(target), 0);
  const targetStatus = positions.length === 0 || targets.length === 0
    || positions.every((position) => position.targetAllocationPercent === null)
    ? 'NONE'
    : positions.every((position) => position.targetAllocationPercent !== null) && Math.abs(targetTotal - 100) < 0.0001
      ? 'COMPLETE'
      : 'INCOMPLETE';

  return {
    positions: positions.map((position) => {
      const currentAllocationPercent = position.currentValue !== null && valuedCurrentValue > 0
        ? (Number.parseFloat(position.currentValue) / valuedCurrentValue * 100).toFixed(2)
        : null;
      const driftPercent = targetStatus === 'COMPLETE' && missingValuationCount === 0 && currentAllocationPercent !== null
        ? (Number.parseFloat(currentAllocationPercent) - Number.parseFloat(position.targetAllocationPercent)).toFixed(2)
        : null;
      return { position: serializeInvestmentPosition(position), currentAllocationPercent, driftPercent };
    }),
    totalCurrentValue: valuedCurrentValue.toFixed(2),
    valuedCurrentValue: valuedCurrentValue.toFixed(2),
    missingValuationCount,
    dataQuality: missingValuationCount === 0 ? 'COMPLETE' : 'PARTIAL',
    targetAllocation: { status: targetStatus, totalPercent: targetTotal.toFixed(2) },
  };
}

function parseInvestmentAmount(value, allowZero) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) && (allowZero || amount > 0) ? amount : null;
}

function findInvestmentTransactionByOperationId(entry, operationId) {
  return entry.investmentTransactions.find((transaction) => transaction.operationId === operationId) ?? null;
}

function sameInvestmentTransactionPayload(transaction, body) {
  return transaction.positionId === body.positionId
    && transaction.type === body.type
    && transaction.amount === body.amount
    && transaction.units === (typeof body.units === 'string' ? body.units : null)
    && transaction.date === body.date;
}

function investmentPositionForReport(entry, position, to) {
  const valuations = investmentTransactionsForPosition(entry, position.id)
    .filter((transaction) => !transaction.voidedAt && transaction.type === 'VALUATION_UPDATE' && transaction.date <= to);
  const valuation = valuations[valuations.length - 1] ?? null;
  return {
    positionId: position.id,
    instrument: position.instrument,
    wrapper: position.wrapper,
    value: valuation?.amount ?? null,
    valuationDate: valuation?.date ?? null,
    completeness: valuation ? 'COMPLETE' : 'PARTIAL',
  };
}

function reportDateRange(req, res, rawUrl) {
  const params = new URLSearchParams(rawUrl.split('?')[1] ?? '');
  const from = params.get('from');
  const to = params.get('to');
  if (!isValidCalendarDate(from) || !isValidCalendarDate(to) || from > to) {
    financialError(req, res, 400, 'REPORT_PERIOD_INVALID', 'The report period is invalid');
    return null;
  }
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  const maximumToDate = new Date(Date.UTC(fromDate.getUTCFullYear() + 1, fromDate.getUTCMonth(), fromDate.getUTCDate()));
  if (toDate >= maximumToDate) {
    financialError(req, res, 400, 'REPORT_PERIOD_INVALID', 'The report period is too long');
    return null;
  }
  return { from, to, fromDate, toDate };
}

function buildHouseholdReport(entry, viewerUserId, range) {
  const accounts = entry.accounts.filter((account) => account.visibility === 'SHARED' || account.ownerUserId === viewerUserId);
  const accountIds = new Set(accounts.map((account) => account.id));
  const transactions = entry.transactions.filter((transaction) => accountIds.has(transaction.accountId));
  const categories = new Map();
  let income = 0;
  let spending = 0;

  for (const transaction of transactions) {
    if (transaction.transferGroupId || transaction.date < range.from || transaction.date > range.to) continue;
    const category = entry.categories.find((item) => item.id === transaction.categoryId);
    const categoryName = category?.name ?? 'Uncategorized';
    const row = categories.get(categoryName) ?? { categoryId: category?.id ?? null, categoryName, income: 0, spending: 0 };
    const amount = Number.parseFloat(transaction.amount);
    if (amount >= 0) {
      income += amount;
      row.income += amount;
    } else {
      spending += Math.abs(amount);
      row.spending += Math.abs(amount);
    }
    categories.set(categoryName, row);
  }

  const accountComponents = accounts.map((account) => {
    const value = Number.parseFloat(account.openingBalance) + transactions
      .filter((transaction) => transaction.accountId === account.id && transaction.date <= range.to)
      .reduce((sum, transaction) => sum + Number.parseFloat(transaction.amount), 0);
    return {
      accountId: account.id,
      name: account.name,
      value: value.toFixed(2),
      openingBalanceBoundary: account.createdAt.slice(0, 10),
      completeness: account.createdAt.slice(0, 10) <= range.to ? 'COMPLETE' : 'PARTIAL',
    };
  });
  const positions = visibleInvestmentPositions(entry, viewerUserId).filter((position) => position.createdAt.slice(0, 10) <= range.to);
  const investmentComponents = positions.map((position) => investmentPositionForReport(entry, position, range.to));
  const accountTotal = accountComponents.reduce((sum, account) => sum + Number.parseFloat(account.value), 0);
  const investmentTotal = investmentComponents.reduce((sum, position) => sum + (position.value === null ? 0 : Number.parseFloat(position.value)), 0);
  const openingBalanceBoundary = accountComponents.map((account) => account.openingBalanceBoundary).sort()[0] ?? null;
  const missingInvestmentValuationCount = investmentComponents.filter((position) => position.value === null).length;
  const notes = [
    'Account net worth uses opening balance plus ledger entries from the account createdAt boundary.',
    ...(missingInvestmentValuationCount > 0 ? ['One or more visible investment positions have no valuation in the report period.'] : []),
    ...(openingBalanceBoundary !== null && range.from < openingBalanceBoundary ? ['The report starts before the oldest visible account opening-balance boundary.'] : []),
  ];

  const currentAndPriorCategories = [...categories.values()].sort((left, right) => left.categoryName.localeCompare(right.categoryName));
  const priorFrom = `${String(Number(range.from.slice(0, 4)) - 1)}${range.from.slice(4)}`;
  const priorTo = `${String(Number(range.to.slice(0, 4)) - 1)}${range.to.slice(4)}`;

  return {
    from: range.from,
    to: range.to,
    cashFlow: {
      income: income.toFixed(2),
      spending: spending.toFixed(2),
      surplus: (income - spending).toFixed(2),
      categories: currentAndPriorCategories.map((category) => ({ ...category, income: category.income.toFixed(2), spending: category.spending.toFixed(2) })),
    },
    categoryComparison: {
      basis: 'EQUIVALENT_PRIOR_YEAR',
      from: priorFrom,
      to: priorTo,
      categories: currentAndPriorCategories.map((category) => ({
        categoryName: category.categoryName,
        currentIncome: category.income.toFixed(2), priorIncome: '0.00', incomeDelta: category.income.toFixed(2),
        currentSpending: category.spending.toFixed(2), priorSpending: '0.00', spendingDelta: category.spending.toFixed(2),
      })),
    },
    netWorth: {
      total: (accountTotal + investmentTotal).toFixed(2),
      accounts: accountComponents,
      investments: investmentComponents,
      components: { accounts: accountTotal.toFixed(2), investments: investmentTotal.toFixed(2) },
    },
    dataQuality: {
      status: missingInvestmentValuationCount > 0 || (openingBalanceBoundary !== null && range.from < openingBalanceBoundary) ? 'PARTIAL' : 'COMPLETE',
      visibleOnly: true,
      missingInvestmentValuationCount,
      accountOpeningBalanceBoundary: openingBalanceBoundary,
      notes,
    },
  };
}

function buildTaxReport(entry, viewerUserId, range) {
  const contributions = [];
  for (const position of visibleInvestmentPositions(entry, viewerUserId)) {
    if (position.wrapper !== 'IKZE') continue;
    for (const transaction of investmentTransactionsForPosition(entry, position.id)) {
      if (!transaction.voidedAt && transaction.type === 'CONTRIBUTION' && transaction.date >= range.from && transaction.date <= range.to) {
        contributions.push({ kind: 'IKZE_CONTRIBUTION', positionId: position.id, instrument: position.instrument, date: transaction.date, amount: transaction.amount });
      }
    }
  }
  contributions.sort((first, second) => first.date.localeCompare(second.date) || first.positionId.localeCompare(second.positionId));
  const total = contributions.reduce((sum, contribution) => sum + Number.parseFloat(contribution.amount), 0);
  return {
    from: range.from,
    to: range.to,
    ikzeContributions: contributions,
    totalIkzeContributions: total.toFixed(2),
    calculations: { annualLimit: null, ikzeHeadroom: null, taxLiability: null },
    informationalOnly: true,
    notice: 'Informational household records only. This report does not calculate tax, liability, eligibility, or tax advice.',
  };
}

const BASE_INVOICE_TIMESTAMPS = {
  createdAt: '2024-04-10T12:00:00.000Z',
  updatedAt: '2024-04-10T12:00:00.000Z',
};

const ACCEPTED_INVOICE_ID = 'accepted-invoice-id';

/**
 * @param {string} invoiceId
 * @param {Partial<Record<string, unknown>>} overrides
 */
function createInvoice(invoiceId, overrides = {}) {
  return {
    id: invoiceId,
    companyId: TEST_COMPANY.id,
    environment: 'TEST',
    contractorId: TEST_CONTRACTOR.id,
    invoiceNumber: 'FV 12/4/2024',
    status: 'ISSUED',
    invoiceType: 'VAT',
    issueDate: '2024-04-10',
    saleDate: '2024-04-10',
    placeOfIssue: 'Wrocław',
    sellerName: TEST_COMPANY.name,
    sellerNip: TEST_COMPANY.nip,
    buyerName: TEST_CONTRACTOR.name,
    buyerNip: TEST_CONTRACTOR.nip,
    totalNet: '100.00',
    totalVat: '23.00',
    totalGross: '123.00',
    paymentReceived: '0.00',
    paymentMethod: 'BANK_TRANSFER',
    paymentDueDate: '2024-04-17',
    currency: 'PLN',
    notes: 'Invoice note',
    correctedInvoiceNumber: null,
    correctionMode: null,
    correctionReason: null,
    correctionImpactType: null,
    correctedInvoice: null,
    ksefStatus: 'accepted',
    ksefReference: '1234567890-20240410-ABCDEF-123456-78',
    issuedAt: '2024-04-10T12:00:00.000Z',
    ...BASE_INVOICE_TIMESTAMPS,
    lines: [
      {
        id: `${invoiceId}-line-1`,
        position: 1,
        name: 'Accounting service',
        unit: 'hour',
        quantity: '2',
        unitNetPrice: '50.00',
        vatRate: '23',
        netValue: '100.00',
        vatValue: '23.00',
        grossValue: '123.00',
      },
    ],
    vatBreakdown: [
      {
        id: `${invoiceId}-vat-1`,
        vatRate: '23',
        netAmount: '100.00',
        vatAmount: '23.00',
      },
    ],
    ...overrides,
  };
}

/** @type {Map<string, Record<string, unknown>>} */
const invoices = new Map([
  [ACCEPTED_INVOICE_ID, createInvoice(ACCEPTED_INVOICE_ID)],
]);

/**
 * Companies created through the onboarding wizard's "no company" flow.
 * Keyed by companyId. `ownerToken` is the auth_token the user held *before*
 * the post-creation session refresh — company-scoped endpoints below only
 * accept the `${ownerToken}::refreshed` token, mirroring the real backend's
 * JWT-staleness behaviour (a JWT minted before the company existed doesn't
 * carry its claim, so company-scoped calls 403 until the session is refreshed).
 * @type {Map<string, { company: Record<string, unknown>, ownerToken: string, ksefCredentials: Record<'TEST' | 'PRODUCTION', boolean> }>}
 */
const onboardingCompanies = new Map();

/**
 * @param {string} token
 * @returns {{ id: string, company: Record<string, unknown> } | null}
 */
function findOnboardingCompanyByToken(token) {
  const baseToken = token.endsWith('::refreshed') ? token.slice(0, -'::refreshed'.length) : token;
  for (const [id, entry] of onboardingCompanies) {
    if (entry.ownerToken === baseToken) return { id, company: entry.company };
  }
  return null;
}

/**
 * @param {string} companyId
 * @param {string | undefined} authToken
 * @returns {{ status: 200, entry: { company: Record<string, unknown>, ownerToken: string, ksefCredentials: Record<'TEST' | 'PRODUCTION', boolean> } } | { status: 403 | 404, body: Record<string, unknown> }}
 */
function requireActivatedOnboardingCompany(companyId, authToken) {
  const entry = onboardingCompanies.get(companyId);
  if (!entry) return { status: 404, body: { error: 'Not found' } };
  if (authToken !== `${entry.ownerToken}::refreshed`) {
    return { status: 403, body: { error: 'Forbidden', message: 'Sesja jest nieaktualna. Odśwież stronę.' } };
  }
  return { status: 200, entry };
}

/**
 * @param {http.IncomingMessage} req
 * @returns {Record<string, string>}
 */
function parseCookies(req) {
  const cookieHeader = req.headers['cookie'] ?? '';
  /** @type {Record<string, string>} */
  const cookies = {};
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key) {
      cookies[key.trim()] = rest.join('=').trim();
    }
  }
  return cookies;
}

/**
 * @param {http.ServerResponse} res
 * @param {http.IncomingMessage} req
 * @param {number} status
 * @param {unknown} data
 * @param {Record<string, string>} [extraHeaders]
 */
function respond(req, res, status, data, extraHeaders = {}) {
  const origin = req.headers['origin'];
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': typeof origin === 'string' ? origin : '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, x-ksef-environment',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}

function respondRaw(req, res, status, body, contentType, extraHeaders = {}) {
  const origin = req.headers['origin'];
  res.writeHead(status, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': typeof origin === 'string' ? origin : '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, x-ksef-environment',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    ...extraHeaders,
  });
  res.end(body);
}

/**
 * @param {http.IncomingMessage} req
 * @returns {Promise<Record<string, unknown>>}
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer((req, res) => {
  const rawUrl = req.url ?? '/';
  const url = rawUrl.split('?')[0];
  const method = req.method ?? 'GET';
  const cookies = parseCookies(req);
  const authToken = cookies['auth_token'];
  const isTestCompanyToken = authToken === 'test-token';

  if (method === 'OPTIONS') {
    return respond(req, res, 204, {});
  }

  if (url === '/health' && method === 'GET') {
    return respond(req, res, 200, { status: 'ok' });
  }

  if (url === '/auth/refresh' && method === 'POST') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const refreshedToken = authToken.endsWith('::refreshed') ? authToken : `${authToken}::refreshed`;
    return respond(req, res, 200, { ok: true }, { 'Set-Cookie': `auth_token=${refreshedToken}; Path=/; SameSite=Lax` });
  }

  if (url === '/auth/me' && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const onboardingCompany = isTestCompanyToken ? null : findOnboardingCompanyByToken(authToken);
    const memberHouseholdEntries = [...households.values()]
      .filter((entry) => entry.members.has(authToken))
    const memberHouseholds = memberHouseholdEntries
      .map((entry) => ({ id: entry.household.id, role: entry.members.get(authToken).role, name: entry.household.name }));
    const householdMember = memberHouseholdEntries[0]?.members.get(authToken);
    const sessionUser = householdMember
      ? { ...TEST_USER, id: householdMember.userId, email: householdMember.userEmail, name: householdMember.displayName }
      : TEST_USER;
    return respond(req, res, 200, {
      authenticated: true,
      user: sessionUser,
      companies: isTestCompanyToken
        ? [{ id: TEST_COMPANY.id, role: 'ADMIN' }]
        : onboardingCompany
          ? [{ id: onboardingCompany.id, role: 'ADMIN' }]
          : [],
      households: memberHouseholds,
    });
  }

  if (url === '/companies/lookup' && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const nip = new URLSearchParams(rawUrl.split('?')[1] ?? '').get('nip') ?? '';
    return respond(req, res, 200, {
      name: `Firma z rejestru ${nip}`,
      nip,
      addressLine1: 'ul. Rejestrowa 10, 00-950 Warszawa',
      addressLine2: null,
      vatStatus: 'ACTIVE',
    });
  }

  if (url === '/companies' && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const onboardingCompany = isTestCompanyToken ? null : findOnboardingCompanyByToken(authToken);
    return respond(req, res, 200, isTestCompanyToken ? [TEST_COMPANY] : onboardingCompany ? [onboardingCompany.company] : []);
  }

  if (url === '/companies' && method === 'POST') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    return readJsonBody(req)
      .then((body) => {
        const companyId = `onboarding-company-${authToken}`;
        const now = new Date().toISOString();
        const company = {
          id: companyId,
          name: typeof body.name === 'string' ? body.name : '',
          nip: typeof body.nip === 'string' ? body.nip : '',
          addressLine1: typeof body.addressLine1 === 'string' ? body.addressLine1 : '',
          addressLine2: typeof body.addressLine2 === 'string' ? body.addressLine2 : null,
          email: typeof body.email === 'string' ? body.email : null,
          phone: typeof body.phone === 'string' ? body.phone : null,
          bankName: typeof body.bankName === 'string' ? body.bankName : null,
          bankAccount: typeof body.bankAccount === 'string' ? body.bankAccount : null,
          vatStatus: 'ACTIVE',
          ksefEnv: 'TEST',
          invoiceNumberPattern: null,
          createdAt: now,
          updatedAt: now,
        };
        onboardingCompanies.set(companyId, { company, ownerToken: authToken, ksefCredentials: { TEST: false, PRODUCTION: false } });
        return respond(req, res, 201, company);
      })
      .catch(() => respond(req, res, 400, { error: 'Invalid JSON body' }));
  }

  const ksefSettingsMatch = url.match(/^\/companies\/([^/]+)\/ksef-settings$/);
  if (ksefSettingsMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, companyId] = ksefSettingsMatch;
    const access = requireActivatedOnboardingCompany(companyId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    return respond(req, res, 200, {
      defaultEnvironment: 'TEST',
      credentials: [
        { environment: 'TEST', hasToken: access.entry.ksefCredentials.TEST },
        { environment: 'PRODUCTION', hasToken: access.entry.ksefCredentials.PRODUCTION },
      ],
    });
  }

  const ksefCredentialMatch = url.match(/^\/companies\/([^/]+)\/ksef-credentials\/(TEST|PRODUCTION)$/);
  if (ksefCredentialMatch && method === 'PUT') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, companyId, environment] = ksefCredentialMatch;
    const access = requireActivatedOnboardingCompany(companyId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    return readJsonBody(req)
      .then((body) => {
        if (typeof body.ksefToken !== 'string' || body.ksefToken.length === 0) {
          return respond(req, res, 400, { error: 'ksefToken is required' });
        }
        access.entry.ksefCredentials[/** @type {'TEST' | 'PRODUCTION'} */ (environment)] = true;
        return respond(req, res, 200, {});
      })
      .catch(() => respond(req, res, 400, { error: 'Invalid JSON body' }));
  }

  const onboardingInviteMatch = url.match(/^\/companies\/([^/]+)\/invites$/);
  if (onboardingInviteMatch && method === 'POST') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, companyId] = onboardingInviteMatch;
    const access = requireActivatedOnboardingCompany(companyId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    return readJsonBody(req)
      .then((body) => {
        const invite = {
          id: `invite-${Date.now()}`,
          email: typeof body.email === 'string' ? body.email : '',
          role: typeof body.role === 'string' ? body.role : 'VIEWER',
          token: `invite-token-${Date.now()}`,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };
        return respond(req, res, 201, invite);
      })
      .catch(() => respond(req, res, 400, { error: 'Invalid JSON body' }));
  }

  if (/^\/companies\/[^/]+$/.test(url) && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, companyId] = url.match(/^\/companies\/([^/]+)$/) ?? [];
    if (companyId === TEST_COMPANY.id) return respond(req, res, 200, TEST_COMPANY);
    const onboardingEntry = companyId ? onboardingCompanies.get(companyId) : undefined;
    if (onboardingEntry) return respond(req, res, 200, onboardingEntry.company);
    return respond(req, res, 404, { error: 'Not found' });
  }

  if (/^\/companies\/[^/]+\/invoices$/.test(url) && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    return respond(req, res, 200, { data: [], total: 0, page: 1, limit: 20 });
  }

  const invoiceDetailMatch = url.match(/^\/companies\/([^/]+)\/invoices\/([^/]+)$/);
  if (invoiceDetailMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, companyId, invoiceId] = invoiceDetailMatch;
    if (companyId !== TEST_COMPANY.id) return respond(req, res, 404, { error: 'Not found' });
    const invoice = invoices.get(invoiceId);
    if (!invoice) return respond(req, res, 404, { error: 'Not found' });
    return respond(req, res, 200, invoice);
  }

  const correctionMatch = url.match(/^\/companies\/([^/]+)\/invoices\/([^/]+)\/correct$/);
  if (correctionMatch && method === 'POST') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, companyId, invoiceId] = correctionMatch;
    if (companyId !== TEST_COMPANY.id) return respond(req, res, 404, { error: 'Not found' });

    const originalInvoice = invoices.get(invoiceId);
    if (!originalInvoice) return respond(req, res, 404, { error: 'Invoice not found' });

    return readJsonBody(req)
      .then((body) => {
        const correctionId = 'kor-draft-1';
        const correctionMode = body.correctionMode === 'formal' ? 'FORMAL' : 'CANCELLATION';
        const correctedInvoiceNumber = typeof body.correctedInvoiceNumber === 'string' ? body.correctedInvoiceNumber : null;
        const correctionReason = correctionMode === 'FORMAL' && correctedInvoiceNumber
          ? `Korekta numeru faktury: bylo ${String(originalInvoice.invoiceNumber)}, powinno byc ${correctedInvoiceNumber}${typeof body.reason === 'string' && body.reason.length > 0 ? `. ${body.reason}` : ''}`
          : typeof body.reason === 'string' ? body.reason : null;
        const amountPrefix = correctionMode === 'FORMAL' ? '' : '-';
        const correctionInvoice = createInvoice(correctionId, {
          invoiceNumber: null,
          status: 'DRAFT',
          invoiceType: 'KOR',
          issueDate: '2024-04-11',
          saleDate: '2024-04-10',
          totalNet: `${amountPrefix}100.00`,
          totalVat: `${amountPrefix}23.00`,
          totalGross: `${amountPrefix}123.00`,
          issuedAt: null,
          correctedInvoiceNumber,
          correctionMode,
          correctionReason,
          correctionImpactType: typeof body.impactType === 'string' ? body.impactType : null,
          correctedInvoice: {
            id: String(originalInvoice.id),
            invoiceNumber: String(originalInvoice.invoiceNumber),
            issueDate: String(originalInvoice.issueDate),
            ksefReference: String(originalInvoice.ksefReference),
          },
          notes: correctionMode === 'FORMAL' && correctedInvoiceNumber
            ? `Korekta formalna faktury ${String(originalInvoice.invoiceNumber)}. Prawidlowy numer: ${correctedInvoiceNumber}`
            : `Korekta faktury ${String(originalInvoice.invoiceNumber)}`,
          ksefStatus: 'not_submitted',
          ksefReference: null,
          lines: [
            {
              id: `${correctionId}-line-1`,
              position: 1,
              name: 'Accounting service',
              unit: 'hour',
              quantity: '2',
              unitNetPrice: `${amountPrefix}50.00`,
              vatRate: '23',
              netValue: `${amountPrefix}100.00`,
              vatValue: `${amountPrefix}23.00`,
              grossValue: `${amountPrefix}123.00`,
            },
          ],
          vatBreakdown: [
            {
              id: `${correctionId}-vat-1`,
              vatRate: '23',
              netAmount: `${amountPrefix}100.00`,
              vatAmount: `${amountPrefix}23.00`,
            },
          ],
          updatedAt: '2024-04-11T09:00:00.000Z',
        });

        invoices.set(correctionId, correctionInvoice);

        return respond(req, res, 201, correctionInvoice);
      })
      .catch(() => respond(req, res, 400, { error: 'Invalid JSON body' }));
  }

  const issueMatch = url.match(/^\/companies\/([^/]+)\/invoices\/([^/]+)\/issue$/);
  if (issueMatch && method === 'POST') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, companyId, invoiceId] = issueMatch;
    if (companyId !== TEST_COMPANY.id) return respond(req, res, 404, { error: 'Not found' });

    const invoice = invoices.get(invoiceId);
    if (!invoice) return respond(req, res, 404, { error: 'Invoice not found' });
    if (invoice.status !== 'DRAFT') return respond(req, res, 409, { error: 'Invoice is not in DRAFT status' });

    const issuedInvoice = {
      ...invoice,
      invoiceNumber: 'KOR 1/4/2024',
      status: 'ISSUED',
      issuedAt: '2024-04-11T09:30:00.000Z',
      updatedAt: '2024-04-11T09:30:00.000Z',
    };

    invoices.set(invoiceId, issuedInvoice);

    return respond(req, res, 200, issuedInvoice);
  }

  if (/^\/companies\/[^/]+\/contractors$/.test(url) && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    return respond(req, res, 200, [TEST_CONTRACTOR]);
  }

  if (/^\/companies\/[^/]+\/contractors\/[^/]+\/service-rates$/.test(url) && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    return respond(req, res, 200, []);
  }

  if (/^\/companies\/[^/]+\/service-templates$/.test(url) && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    return respond(req, res, 200, []);
  }

  if (/^\/companies\/[^/]+\/members$/.test(url) && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    return respond(req, res, 200, [TEST_MEMBER]);
  }

  if (/^\/companies\/[^/]+\/invites$/.test(url) && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    return respond(req, res, 200, []);
  }

  if (/^\/companies\/[^/]+\/incoming$/.test(url) && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    return respond(req, res, 200, { data: [], total: 0, page: 1, limit: 20 });
  }

  if (url === '/backup/status' && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    return respond(req, res, 200, { gdrive: null, icloud: null });
  }

  // ─── Household (personal mode) routes ───────────────────────────────────

  if (url === '/households' && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const memberships = [...households.values()]
      .filter((entry) => entry.members.has(authToken))
      .map((entry) => ({ householdId: entry.household.id, role: entry.members.get(authToken).role, name: entry.household.name }));
    return respond(req, res, 200, memberships);
  }

  if (url === '/households' && method === 'POST') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    return readJsonBody(req)
      .then((body) => {
        if (typeof body.name !== 'string' || body.name.length === 0) {
          return respond(req, res, 400, { error: 'name is required' });
        }
        const householdId = `household-${crypto.randomUUID()}`;
        const entry = createHouseholdEntry({
          id: householdId,
          name: body.name,
          currency: typeof body.currency === 'string' ? body.currency : undefined,
          ownerToken: authToken,
          ownerMember: { userId: TEST_USER.id, userEmail: TEST_USER.email, displayName: TEST_USER.name, role: 'OWNER' },
        });
        households.set(householdId, entry);
        return respond(req, res, 201, entry.household);
      })
      .catch(() => respond(req, res, 400, { error: 'Invalid JSON body' }));
  }

  const householdDetailMatch = url.match(/^\/households\/([^/]+)$/);
  if (householdDetailMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId] = householdDetailMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    return respond(req, res, 200, access.entry.household);
  }

  const householdMembersMatch = url.match(/^\/households\/([^/]+)\/members$/);
  if (householdMembersMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId] = householdMembersMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    return respond(req, res, 200, [...access.entry.members.values()]);
  }

  const householdAccountsMatch = url.match(/^\/households\/([^/]+)\/accounts$/);
  if (householdAccountsMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId] = householdAccountsMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    return respond(req, res, 200, listVisibleAccounts(access.entry, access.member.userId));
  }

  if (householdAccountsMatch && method === 'POST') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId] = householdAccountsMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    return readJsonBody(req)
      .then((body) => {
        if (typeof body.name !== 'string' || body.name.length === 0 || typeof body.type !== 'string') {
          return respond(req, res, 400, { error: 'name and type are required' });
        }
        const visibility = body.visibility === 'PRIVATE' ? 'PRIVATE' : 'SHARED';
        const now = new Date().toISOString();
        const account = {
          id: `${householdId}-account-${crypto.randomUUID()}`,
          householdId,
          name: body.name,
          type: body.type,
          accountNumberMask: typeof body.accountNumberMask === 'string' ? body.accountNumberMask : null,
          visibility,
          ownerUserId: visibility === 'PRIVATE' ? (typeof body.ownerUserId === 'string' ? body.ownerUserId : access.member.userId) : null,
          openingBalance: typeof body.openingBalance === 'string' ? body.openingBalance : '0.00',
          creditLimit: typeof body.creditLimit === 'string' ? body.creditLimit : null,
          statementDay: typeof body.statementDay === 'number' ? body.statementDay : null,
          createdAt: now,
          updatedAt: now,
        };
        access.entry.accounts.push(account);
        return respond(req, res, 201, serializeHouseholdAccount(access.entry, account));
      })
      .catch(() => respond(req, res, 400, { error: 'Invalid JSON body' }));
  }

  const householdInvestmentsMatch = url.match(/^\/households\/([^/]+)\/investments$/);
  if (householdInvestmentsMatch && (method === 'GET' || method === 'POST')) {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId] = householdInvestmentsMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);

    if (method === 'GET') {
      if (authToken === HOUSEHOLD_DATA_FAILURE_TOKEN) return financialError(req, res, 503, 'INVESTMENTS_UNAVAILABLE', 'Investments unavailable');
      return respond(req, res, 200, buildInvestmentPortfolio(access.entry, access.member.userId));
    }

    return readJsonBody(req)
      .then((body) => {
        if (!['TAXABLE', 'IKE', 'IKZE'].includes(body.wrapper)
          || typeof body.instrument !== 'string'
          || body.instrument.trim().length === 0
          || body.instrument.trim().length > 160
          || (body.visibility !== undefined && !['SHARED', 'PRIVATE'].includes(body.visibility))) {
          return financialError(req, res, 400, 'VALIDATION_ERROR', 'Check the entered investment data');
        }
        const target = body.targetAllocationPercent === null || body.targetAllocationPercent === undefined
          ? null
          : parseInvestmentAmount(body.targetAllocationPercent, true);
        if (body.targetAllocationPercent !== null && body.targetAllocationPercent !== undefined && (target === null || target > 100)) {
          return financialError(req, res, 400, 'VALIDATION_ERROR', 'Target allocation must be between 0 and 100');
        }
        const now = new Date().toISOString();
        const position = {
          id: `${householdId}-investment-${crypto.randomUUID()}`,
          householdId,
          ownerUserId: access.member.userId,
          wrapper: body.wrapper,
          visibility: body.visibility === 'SHARED' ? 'SHARED' : 'PRIVATE',
          instrument: body.instrument.trim(),
          units: '0',
          costBasis: '0.00',
          currentValue: null,
          targetAllocationPercent: target === null ? null : target.toFixed(2),
          lastValuedAt: null,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        access.entry.investments.push(position);
        return respond(req, res, 201, serializeInvestmentPosition(position));
      })
      .catch(() => financialError(req, res, 400, 'VALIDATION_ERROR', 'Invalid JSON body'));
  }

  const householdInvestmentHistoryMatch = url.match(/^\/households\/([^/]+)\/investments\/value-history$/);
  if (householdInvestmentHistoryMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId] = householdInvestmentHistoryMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    if (authToken === HOUSEHOLD_DATA_FAILURE_TOKEN) return financialError(req, res, 503, 'INVESTMENTS_UNAVAILABLE', 'Investment history unavailable');
    const params = new URLSearchParams(rawUrl.split('?')[1] ?? '');
    const from = params.get('from');
    const to = params.get('to');
    if ((from !== null && !isValidCalendarDate(from)) || (to !== null && !isValidCalendarDate(to)) || (from !== null && to !== null && from > to)) {
      return financialError(req, res, 400, 'VALIDATION_ERROR', 'The value history range is invalid');
    }
    const positions = visibleInvestmentPositions(access.entry, access.member.userId, true);
    const data = access.entry.investmentTransactions
      .filter((transaction) => transaction.type === 'VALUATION_UPDATE' && !transaction.voidedAt)
      .filter((transaction) => positions.some((position) => position.id === transaction.positionId))
      .filter((transaction) => (from === null || transaction.date >= from) && (to === null || transaction.date <= to))
      .sort((first, second) => first.date.localeCompare(second.date) || first.createdAt.localeCompare(second.createdAt))
      .map((transaction) => {
        const position = access.entry.investments.find((item) => item.id === transaction.positionId);
        return { transactionId: transaction.id, positionId: transaction.positionId, instrument: position.instrument, wrapper: position.wrapper, date: transaction.date, value: transaction.amount };
      });
    return respond(req, res, 200, { data, from, to, missingValuationPositionIds: positions.filter((position) => !data.some((point) => point.positionId === position.id)).map((position) => position.id) });
  }

  const householdInvestmentContributionsMatch = url.match(/^\/households\/([^/]+)\/investments\/contributions$/);
  if (householdInvestmentContributionsMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId] = householdInvestmentContributionsMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    if (authToken === HOUSEHOLD_DATA_FAILURE_TOKEN) return financialError(req, res, 503, 'INVESTMENTS_UNAVAILABLE', 'Investment contributions unavailable');
    const params = new URLSearchParams(rawUrl.split('?')[1] ?? '');
    const yearValue = params.get('year');
    const year = yearValue === null || yearValue === '' ? null : Number.parseInt(yearValue, 10);
    const annualLimit = params.get('annualLimit');
    const annualLimitSource = params.get('annualLimitSource');
    const annualLimitConfirmation = params.get('annualLimitConfirmation');
    if (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100)) return financialError(req, res, 400, 'VALIDATION_ERROR', 'The year is invalid');
    if ((annualLimit !== null || annualLimitSource !== null || annualLimitConfirmation !== null)
      && (year === null || annualLimit === null || annualLimitSource === null || annualLimitSource.trim() === '' || annualLimitConfirmation !== 'USER_CONFIRMED')) {
      return financialError(req, res, 400, 'VALIDATION_ERROR', 'IKZE limit evidence is incomplete');
    }
    const positions = visibleInvestmentPositions(access.entry, access.member.userId, true);
    const data = access.entry.investmentTransactions
      .filter((transaction) => transaction.type === 'CONTRIBUTION' && !transaction.voidedAt)
      .filter((transaction) => positions.some((position) => position.id === transaction.positionId))
      .filter((transaction) => year === null || transaction.date.startsWith(`${year}-`))
      .sort((first, second) => first.date.localeCompare(second.date) || first.createdAt.localeCompare(second.createdAt))
      .map((transaction) => {
        const position = access.entry.investments.find((item) => item.id === transaction.positionId);
        return { transaction: serializeInvestmentTransaction(transaction), positionId: position.id, instrument: position.instrument, wrapper: position.wrapper };
      });
    const totalContribution = data.reduce((sum, item) => sum + Number.parseFloat(item.transaction.amount), 0);
    const ikzeContribution = data.filter((item) => item.wrapper === 'IKZE').reduce((sum, item) => sum + Number.parseFloat(item.transaction.amount), 0);
    const parsedLimit = annualLimit === null ? null : Number.parseFloat(annualLimit);
    return respond(req, res, 200, {
      data,
      totalContribution: totalContribution.toFixed(2),
      ikzeContribution: ikzeContribution.toFixed(2),
      year,
      annualLimit: parsedLimit === null ? null : parsedLimit.toFixed(2),
      annualLimitSource,
      annualLimitConfirmation: annualLimitConfirmation === 'USER_CONFIRMED' ? annualLimitConfirmation : null,
      ikzeHeadroom: parsedLimit === null ? null : Math.max(0, parsedLimit - ikzeContribution).toFixed(2),
    });
  }

  const householdInvestmentPositionMatch = url.match(/^\/households\/([^/]+)\/investments\/([^/]+)$/);
  if (householdInvestmentPositionMatch && method === 'PATCH') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId, positionId] = householdInvestmentPositionMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    const position = findVisibleInvestmentPosition(access.entry, positionId, access.member.userId);
    if (!position) return financialError(req, res, 404, 'INVESTMENT_NOT_FOUND', 'Investment position was not found');
    if (position.ownerUserId !== access.member.userId) return financialError(req, res, 409, 'INVESTMENT_OWNER_REQUIRED', 'Only the investment position owner can change it');
    return readJsonBody(req)
      .then((body) => {
        if (position.archivedAt && (body.archive !== true || Object.keys(body).some((field) => field !== 'archive'))) return financialError(req, res, 409, 'INVESTMENT_INVALID_STATE', 'Archived investment positions are read-only');
        if (body.archive === true) {
          if (position.units !== '0' || position.currentValue !== '0.00') return financialError(req, res, 409, 'INVESTMENT_INVALID_STATE', 'The position must have zero units and zero current value');
          position.archivedAt = new Date().toISOString();
        }
        if (typeof body.instrument === 'string' && body.instrument.trim()) position.instrument = body.instrument.trim();
        if (['TAXABLE', 'IKE', 'IKZE'].includes(body.wrapper)) position.wrapper = body.wrapper;
        if (['SHARED', 'PRIVATE'].includes(body.visibility)) position.visibility = body.visibility;
        if (body.targetAllocationPercent === null) position.targetAllocationPercent = null;
        if (typeof body.targetAllocationPercent === 'string') {
          const target = parseInvestmentAmount(body.targetAllocationPercent, true);
          if (target === null || target > 100) return financialError(req, res, 400, 'VALIDATION_ERROR', 'Target allocation must be between 0 and 100');
          position.targetAllocationPercent = target.toFixed(2);
        }
        position.updatedAt = new Date().toISOString();
        return respond(req, res, 200, serializeInvestmentPosition(position));
      })
      .catch(() => financialError(req, res, 400, 'VALIDATION_ERROR', 'Invalid JSON body'));
  }

  const householdInvestmentTransactionsMatch = url.match(/^\/households\/([^/]+)\/investments\/([^/]+)\/transactions$/);
  if (householdInvestmentTransactionsMatch && (method === 'GET' || method === 'POST')) {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId, positionId] = householdInvestmentTransactionsMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    const position = findVisibleInvestmentPosition(access.entry, positionId, access.member.userId);
    if (!position) return financialError(req, res, 404, 'INVESTMENT_NOT_FOUND', 'Investment position was not found');
    if (method === 'GET') {
      return respond(req, res, 200, [...access.entry.investmentTransactions]
        .filter((transaction) => transaction.positionId === positionId)
        .sort((first, second) => second.date.localeCompare(first.date) || second.createdAt.localeCompare(first.createdAt))
        .map(serializeInvestmentTransaction));
    }
    if (position.ownerUserId !== access.member.userId) return financialError(req, res, 409, 'INVESTMENT_OWNER_REQUIRED', 'Only the investment position owner can record transactions');

    return readJsonBody(req)
      .then((body) => {
        const validTypes = ['BUY', 'SELL', 'VALUATION_UPDATE', 'CONTRIBUTION'];
        const amount = parseInvestmentAmount(body.amount, body.type === 'VALUATION_UPDATE');
        const units = body.units === undefined ? null : parseInvestmentAmount(body.units, false);
        if (!validTypes.includes(body.type) || amount === null || !isValidCalendarDate(body.date) || typeof body.operationId !== 'string' || body.operationId.trim().length === 0) {
          return financialError(req, res, 400, 'VALIDATION_ERROR', 'Check the entered transaction data');
        }
        if ((body.type === 'BUY' || body.type === 'SELL') && units === null) return financialError(req, res, 400, 'VALIDATION_ERROR', 'Units are required for this transaction');
        if ((body.type === 'VALUATION_UPDATE' || body.type === 'CONTRIBUTION') && body.units !== undefined) return financialError(req, res, 400, 'VALIDATION_ERROR', 'This transaction does not accept units');
        const normalizedBody = { ...body, positionId, amount: amount.toFixed(2), units: units === null ? null : formatInvestmentUnits(units), operationId: body.operationId.trim() };
        const existing = findInvestmentTransactionByOperationId(access.entry, normalizedBody.operationId);
        if (existing) {
          if (!sameInvestmentTransactionPayload(existing, normalizedBody)) return financialError(req, res, 409, 'IDEMPOTENCY_CONFLICT', 'The operationId was already used with a different payload');
          return respond(req, res, 200, { transaction: serializeInvestmentTransaction(existing), position: serializeInvestmentPosition(position), replayed: true });
        }
        if (position.archivedAt) return financialError(req, res, 409, 'INVESTMENT_INVALID_STATE', 'Archived investment positions are read-only');
        if (body.type === 'SELL' && units > Number.parseFloat(position.units)) return financialError(req, res, 409, 'SELL_UNITS_INSUFFICIENT', 'The sell transaction exceeds available units');
        const now = new Date().toISOString();
        const transaction = {
          id: `${positionId}-transaction-${crypto.randomUUID()}`,
          householdId,
          positionId,
          type: body.type,
          units: normalizedBody.units,
          amount: normalizedBody.amount,
          date: body.date,
          operationId: normalizedBody.operationId,
          voidedAt: null,
          voidedByUserId: null,
          createdAt: now,
        };
        access.entry.investmentTransactions.push(transaction);
        recomputeInvestmentPosition(access.entry, position);
        return respond(req, res, 201, { transaction: serializeInvestmentTransaction(transaction), position: serializeInvestmentPosition(position), replayed: false });
      })
      .catch(() => financialError(req, res, 400, 'VALIDATION_ERROR', 'Invalid JSON body'));
  }

  const householdInvestmentVoidMatch = url.match(/^\/households\/([^/]+)\/investments\/([^/]+)\/transactions\/([^/]+)\/void$/);
  if (householdInvestmentVoidMatch && method === 'POST') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId, positionId, transactionId] = householdInvestmentVoidMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    const position = findVisibleInvestmentPosition(access.entry, positionId, access.member.userId);
    if (!position) return financialError(req, res, 404, 'INVESTMENT_NOT_FOUND', 'Investment position was not found');
    if (position.ownerUserId !== access.member.userId) return financialError(req, res, 409, 'INVESTMENT_OWNER_REQUIRED', 'Only the investment position owner can void transactions');
    const transaction = access.entry.investmentTransactions.find((item) => item.id === transactionId && item.positionId === positionId);
    if (!transaction) return financialError(req, res, 404, 'INVESTMENT_TRANSACTION_NOT_FOUND', 'Investment transaction was not found');
    if (transaction.voidedAt) return respond(req, res, 200, { transaction: serializeInvestmentTransaction(transaction), position: serializeInvestmentPosition(position), replayed: true });
    transaction.voidedAt = new Date().toISOString();
    transaction.voidedByUserId = access.member.userId;
    recomputeInvestmentPosition(access.entry, position);
    return respond(req, res, 200, { transaction: serializeInvestmentTransaction(transaction), position: serializeInvestmentPosition(position), replayed: false });
  }

  const householdReportSummaryMatch = url.match(/^\/households\/([^/]+)\/reports\/summary$/);
  if (householdReportSummaryMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId] = householdReportSummaryMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    if (authToken === HOUSEHOLD_DATA_FAILURE_TOKEN) return financialError(req, res, 503, 'REPORTS_UNAVAILABLE', 'Reports unavailable');
    const range = reportDateRange(req, res, rawUrl);
    if (!range) return;
    return respond(req, res, 200, buildHouseholdReport(access.entry, access.member.userId, range));
  }

  const householdTaxReportMatch = url.match(/^\/households\/([^/]+)\/reports\/tax-return$/);
  if (householdTaxReportMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId] = householdTaxReportMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    if (authToken === HOUSEHOLD_DATA_FAILURE_TOKEN) return financialError(req, res, 503, 'REPORTS_UNAVAILABLE', 'Tax report unavailable');
    const range = reportDateRange(req, res, rawUrl);
    if (!range) return;
    return respond(req, res, 200, buildTaxReport(access.entry, access.member.userId, range));
  }

  const householdReportExportMatch = url.match(/^\/households\/([^/]+)\/reports\/export$/);
  if (householdReportExportMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId] = householdReportExportMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    const range = reportDateRange(req, res, rawUrl);
    if (!range) return;
    const format = new URLSearchParams(rawUrl.split('?')[1] ?? '').get('format');
    if (format !== 'csv' && format !== 'pdf') return financialError(req, res, 400, 'VALIDATION_ERROR', 'The export format is invalid');
    const report = buildHouseholdReport(access.entry, access.member.userId, range);
    if (format === 'csv') {
      const csv = `\uFEFFSection,Name,Value\r\nCash flow,Income,${report.cashFlow.income}\r\nCash flow,Spending,${report.cashFlow.spending}\r\nNet worth,Total,${report.netWorth.total}\r\n`;
      return respondRaw(req, res, 200, csv, 'text/csv; charset=utf-8', { 'Cache-Control': 'private, no-store', 'Content-Disposition': `attachment; filename="household-report-${range.from}-${range.to}.csv"` });
    }
    return respondRaw(req, res, 200, Buffer.from('%PDF-1.7\n% household report'), 'application/pdf', { 'Cache-Control': 'private, no-store', 'Content-Disposition': `attachment; filename="household-report-${range.from}-${range.to}.pdf"` });
  }

  const householdGoalsOverviewMatch = url.match(/^\/households\/([^/]+)\/goals\/overview$/);
  if (householdGoalsOverviewMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    if (authToken === HOUSEHOLD_DATA_FAILURE_TOKEN) return goalError(req, res, 503, 'GOALS_UNAVAILABLE', 'Goals are temporarily unavailable');
    const [, householdId] = householdGoalsOverviewMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    return respond(req, res, 200, buildGoalsOverview(access.entry, access.member.userId));
  }

  const householdGoalsMatch = url.match(/^\/households\/([^/]+)\/goals$/);
  if (householdGoalsMatch && (method === 'GET' || method === 'POST')) {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId] = householdGoalsMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);

    if (method === 'GET') {
      return respond(req, res, 200, visibleGoals(access.entry, access.member.userId).map((goal) => serializeGoal(access.entry, goal)));
    }

    return readJsonBody(req)
      .then((body) => {
        if (typeof body.accountId !== 'string' || typeof body.name !== 'string' || body.name.trim().length === 0 || typeof body.kind !== 'string') {
          return goalError(req, res, 400, 'VALIDATION_ERROR', 'Check the entered data');
        }
        if (!['ONE_OFF', 'ONGOING', 'NO_CEILING'].includes(body.kind)) {
          return goalError(req, res, 400, 'VALIDATION_ERROR', 'Check the entered data');
        }
        const account = access.entry.accounts.find((candidate) => candidate.id === body.accountId);
        if (!isVisibleAccount(account, access.member.userId) || account.type === 'CREDIT_CARD') {
          return goalError(req, res, 404, 'ACCOUNT_NOT_FOUND', 'Account was not found or is not visible');
        }
        const now = new Date().toISOString();
        const goal = {
          id: `${householdId}-goal-${crypto.randomUUID()}`,
          householdId,
          accountId: body.accountId,
          name: body.name.trim(),
          description: typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null,
          kind: body.kind,
          status: 'ACTIVE',
          targetAmount: body.kind === 'NO_CEILING' ? null : typeof body.targetAmount === 'string' ? Number.parseFloat(body.targetAmount).toFixed(2) : null,
          currentAmount: '0.00',
          targetDate: typeof body.targetDate === 'string' ? body.targetDate : null,
          monthlyAmount: typeof body.monthlyAmount === 'string' ? Number.parseFloat(body.monthlyAmount).toFixed(2) : null,
          createdAt: now,
          updatedAt: now,
          rules: [],
          movements: [],
        };
        access.entry.goals.push(goal);
        return respond(req, res, 201, serializeGoal(access.entry, goal));
      })
      .catch(() => goalError(req, res, 400, 'VALIDATION_ERROR', 'Invalid JSON body'));
  }

  const householdGoalDetailMatch = url.match(/^\/households\/([^/]+)\/goals\/([^/]+)$/);
  if (householdGoalDetailMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId, goalIdentifier] = householdGoalDetailMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    const goal = findVisibleGoal(access.entry, goalIdentifier, access.member.userId);
    if (!goal) return goalError(req, res, 404, 'GOAL_NOT_FOUND', 'Goal was not found');
    return respond(req, res, 200, serializeGoalDetail(access.entry, goal));
  }

  if (householdGoalDetailMatch && method === 'PATCH') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId, goalIdentifier] = householdGoalDetailMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    const goal = findVisibleGoal(access.entry, goalIdentifier, access.member.userId);
    if (!goal) return goalError(req, res, 404, 'GOAL_NOT_FOUND', 'Goal was not found');
    if (goal.status === 'ARCHIVED') return goalError(req, res, 409, 'GOAL_INVALID_STATE', 'Archived goals are read-only');

    return readJsonBody(req)
      .then((body) => {
        if (body.status === 'ARCHIVED' && Number.parseFloat(goal.currentAmount) !== 0) {
          return goalError(req, res, 409, 'GOAL_INVALID_STATE', 'A goal can be archived only with zero current amount');
        }
        if (typeof body.name === 'string' && body.name.trim()) goal.name = body.name.trim();
        if (body.description === null || typeof body.description === 'string') goal.description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null;
        if (typeof body.status === 'string' && ['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'].includes(body.status)) goal.status = body.status;
        goal.updatedAt = new Date().toISOString();
        return respond(req, res, 200, serializeGoalDetail(access.entry, goal));
      })
      .catch(() => goalError(req, res, 400, 'VALIDATION_ERROR', 'Invalid JSON body'));
  }

  const householdGoalTransfersMatch = url.match(/^\/households\/([^/]+)\/goals\/([^/]+)\/transfers$/);
  if (householdGoalTransfersMatch && method === 'POST') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId, goalIdentifier] = householdGoalTransfersMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    const goal = findVisibleGoal(access.entry, goalIdentifier, access.member.userId);
    if (!goal) return goalError(req, res, 404, 'GOAL_NOT_FOUND', 'Goal was not found');
    if (goal.status === 'ARCHIVED') return goalError(req, res, 409, 'GOAL_INVALID_STATE', 'Archived goals are read-only');

    return readJsonBody(req)
      .then((body) => {
        const amount = typeof body.amount === 'string' ? Number.parseFloat(body.amount) : Number.NaN;
        const account = access.entry.accounts.find((candidate) => candidate.id === body.accountId);
        if (typeof body.accountId !== 'string' || !isVisibleAccount(account, access.member.userId) || account.type === 'CREDIT_CARD') {
          return goalError(req, res, 404, 'ACCOUNT_NOT_FOUND', 'Account was not found or is not visible');
        }
        if (account.id === goal.accountId) return goalError(req, res, 400, 'VALIDATION_ERROR', 'Funding and goal accounts must be different');
        if (!Number.isFinite(amount) || amount <= 0 || typeof body.effectiveDate !== 'string') {
          return goalError(req, res, 400, 'VALIDATION_ERROR', 'Check the entered data');
        }
        const signedAmount = body.direction === 'WITHDRAW' ? -amount : amount;
        if (signedAmount > 0 && goal.targetAmount !== null && Number.parseFloat(goal.currentAmount) + signedAmount > Number.parseFloat(goal.targetAmount)) {
          return goalError(req, res, 409, 'GOAL_TARGET_EXCEEDED', 'The movement would exceed the goal target');
        }
        if (signedAmount > 0 && Number.parseFloat(accountBalance(access.entry, account)) < signedAmount) {
          return goalError(req, res, 409, 'SOURCE_ACCOUNT_FUNDS_INSUFFICIENT', 'The source account does not have enough available funds');
        }
        if (signedAmount < 0 && Number.parseFloat(goal.currentAmount) < Math.abs(signedAmount)) {
          return goalError(req, res, 409, 'GOAL_BALANCE_INSUFFICIENT', 'The goal balance is insufficient');
        }

        const now = new Date().toISOString();
        const nextAmount = Number.parseFloat(goal.currentAmount) + signedAmount;
        const transferGroupIdentifier = crypto.randomUUID();
        const movementIdentifier = `${goal.id}-movement-${crypto.randomUUID()}`;
        const movement = {
          id: movementIdentifier,
          householdId,
          goalId: goal.id,
          amount: signedAmount.toFixed(2),
          source: 'MANUAL',
          effectiveDate: body.effectiveDate,
          note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
          createdByUserId: access.member.userId,
          automationRuleId: null,
          sourceTransactionId: null,
          transferGroupId: transferGroupIdentifier,
          idempotencyKey: typeof body.operationId === 'string' ? body.operationId : crypto.randomUUID(),
          calculationWindowStart: null,
          calculationWindowEnd: null,
          balanceAfter: nextAmount.toFixed(2),
          createdAt: now,
        };
        const sourceTransaction = serializeHouseholdTransaction({
          id: `${transferGroupIdentifier}-source`,
          householdId,
          accountId: account.id,
          payee: `Goal: ${goal.name}`,
          payerUserId: access.member.userId,
          amount: (-signedAmount).toFixed(2),
          date: body.effectiveDate,
          note: movement.note,
          transferGroupId: transferGroupIdentifier,
          goalMovementId: movementIdentifier,
          createdAt: now,
          updatedAt: now,
        });
        const goalTransaction = serializeHouseholdTransaction({
          id: `${transferGroupIdentifier}-goal`,
          householdId,
          accountId: goal.accountId,
          payee: body.direction === 'WITHDRAW' ? `Goal withdrawal: ${goal.name}` : `Goal funding: ${goal.name}`,
          payerUserId: access.member.userId,
          amount: signedAmount.toFixed(2),
          date: body.effectiveDate,
          note: movement.note,
          transferGroupId: transferGroupIdentifier,
          goalMovementId: movementIdentifier,
          createdAt: now,
          updatedAt: now,
        });
        access.entry.transactions.push(sourceTransaction, goalTransaction);
        goal.movements.push(movement);
        goal.currentAmount = nextAmount.toFixed(2);
        if (signedAmount > 0 && goal.kind === 'ONE_OFF' && goal.targetAmount !== null && nextAmount === Number.parseFloat(goal.targetAmount)) goal.status = 'COMPLETED';
        if (signedAmount < 0 && goal.status === 'COMPLETED') goal.status = 'ACTIVE';
        goal.updatedAt = now;
        return respond(req, res, 201, { movement: serializeGoalMovement(movement), sourceTransaction, goalTransaction, replayed: false });
      })
      .catch(() => goalError(req, res, 400, 'VALIDATION_ERROR', 'Invalid JSON body'));
  }

  const householdGoalMovementsMatch = url.match(/^\/households\/([^/]+)\/goals\/([^/]+)\/movements$/);
  if (householdGoalMovementsMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId, goalIdentifier] = householdGoalMovementsMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    const goal = findVisibleGoal(access.entry, goalIdentifier, access.member.userId);
    if (!goal) return goalError(req, res, 404, 'GOAL_NOT_FOUND', 'Goal was not found');
    return respond(req, res, 200, { data: [...goal.movements].reverse().map(serializeGoalMovement), nextCursor: null });
  }

  const householdGoalRulesMatch = url.match(/^\/households\/([^/]+)\/goals\/([^/]+)\/automation-rules$/);
  if (householdGoalRulesMatch && (method === 'GET' || method === 'POST')) {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId, goalIdentifier] = householdGoalRulesMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    const goal = findVisibleGoal(access.entry, goalIdentifier, access.member.userId);
    if (!goal) return goalError(req, res, 404, 'GOAL_NOT_FOUND', 'Goal was not found');
    if (method === 'GET') return respond(req, res, 200, goal.rules.map(serializeGoalAutomationRule));

    return readJsonBody(req)
      .then((body) => {
        const fundingAccount = access.entry.accounts.find((candidate) => candidate.id === body.fundingAccountId);
        const triggerAccount = access.entry.accounts.find((candidate) => candidate.id === body.triggerAccountId);
        if (typeof body.ruleType !== 'string' || !['FIXED_ON_DAY', 'PERCENT_OF_INCOME_OVER_THRESHOLD', 'ROUND_UP'].includes(body.ruleType) || !isVisibleAccount(fundingAccount, access.member.userId) || fundingAccount.id === goal.accountId) {
          return goalError(req, res, 400, 'VALIDATION_ERROR', 'Check the entered data');
        }
        if (body.ruleType !== 'FIXED_ON_DAY' && !isVisibleAccount(triggerAccount, access.member.userId)) {
          return goalError(req, res, 400, 'VALIDATION_ERROR', 'Check the entered data');
        }
        const now = new Date().toISOString();
        const rule = {
          id: `${goal.id}-rule-${crypto.randomUUID()}`,
          householdId,
          goalId: goal.id,
          ruleType: body.ruleType,
          fundingAccountId: fundingAccount.id,
          triggerAccountId: body.ruleType === 'FIXED_ON_DAY' ? null : triggerAccount.id,
          createdByUserId: access.member.userId,
          startsOn: typeof body.startsOn === 'string' ? body.startsOn : new Date().toISOString().slice(0, 10),
          isActive: body.isActive !== false,
          fixedAmount: typeof body.fixedAmount === 'string' ? Number.parseFloat(body.fixedAmount).toFixed(2) : null,
          dayOfMonth: typeof body.dayOfMonth === 'number' ? body.dayOfMonth : null,
          percentage: typeof body.percentage === 'string' ? Number.parseFloat(body.percentage).toFixed(2) : null,
          incomeThreshold: typeof body.incomeThreshold === 'string' ? Number.parseFloat(body.incomeThreshold).toFixed(2) : null,
          roundUpToAmount: typeof body.roundUpToAmount === 'string' ? Number.parseFloat(body.roundUpToAmount).toFixed(2) : null,
          createdAt: now,
          updatedAt: now,
        };
        goal.rules.push(rule);
        return respond(req, res, 201, serializeGoalAutomationRule(rule));
      })
      .catch(() => goalError(req, res, 400, 'VALIDATION_ERROR', 'Invalid JSON body'));
  }

  const householdGoalRuleDetailMatch = url.match(/^\/households\/([^/]+)\/goals\/([^/]+)\/automation-rules\/([^/]+)$/);
  if (householdGoalRuleDetailMatch && (method === 'PATCH' || method === 'DELETE')) {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId, goalIdentifier, ruleIdentifier] = householdGoalRuleDetailMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    const goal = findVisibleGoal(access.entry, goalIdentifier, access.member.userId);
    const rule = goal?.rules.find((candidate) => candidate.id === ruleIdentifier);
    if (!goal || !rule) return goalError(req, res, 404, 'GOAL_NOT_FOUND', 'Goal automation rule was not found');
    if (goal.status === 'ARCHIVED') return goalError(req, res, 409, 'GOAL_INVALID_STATE', 'Archived goals are read-only');
    if (method === 'DELETE') {
      goal.rules = goal.rules.filter((candidate) => candidate.id !== ruleIdentifier);
      return respond(req, res, 204, {});
    }

    return readJsonBody(req)
      .then((body) => {
        for (const field of ['fundingAccountId', 'triggerAccountId', 'startsOn', 'isActive', 'fixedAmount', 'dayOfMonth', 'percentage', 'incomeThreshold', 'roundUpToAmount']) {
          if (Object.prototype.hasOwnProperty.call(body, field)) rule[field] = body[field];
        }
        rule.updatedAt = new Date().toISOString();
        return respond(req, res, 200, serializeGoalAutomationRule(rule));
      })
      .catch(() => goalError(req, res, 400, 'VALIDATION_ERROR', 'Invalid JSON body'));
  }

  const householdCategoriesMatch = url.match(/^\/households\/([^/]+)\/categories$/);
  if (householdCategoriesMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId] = householdCategoriesMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    return respond(req, res, 200, access.entry.categories);
  }

  const householdEnvelopesMatch = url.match(/^\/households\/([^/]+)\/envelopes$/);
  if (householdEnvelopesMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId] = householdEnvelopesMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    return respond(req, res, 200, access.entry.envelopes.map((envelope) => serializeHouseholdEnvelope(access.entry, envelope)));
  }

  const householdCommitmentsMatch = url.match(/^\/households\/([^/]+)\/commitments$/);
  if (householdCommitmentsMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId] = householdCommitmentsMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    return respond(req, res, 200, access.entry.commitments);
  }

  const householdCommitmentDetailMatch = url.match(/^\/households\/([^/]+)\/commitments\/([^/]+)$/);
  if (householdCommitmentDetailMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId, commitmentId] = householdCommitmentDetailMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    const commitment = access.entry.commitments.find((item) => item.id === commitmentId);
    if (!commitment) return respond(req, res, 404, { error: 'Not found' });
    return respond(req, res, 200, commitment);
  }

  if (householdCommitmentsMatch && method === 'POST') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId] = householdCommitmentsMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    return readJsonBody(req)
      .then((body) => {
        if (typeof body.name !== 'string' || body.name.length === 0 || typeof body.amount !== 'string') {
          return respond(req, res, 400, { error: 'name and amount are required' });
        }
        const now = new Date().toISOString();
        const commitment = {
          id: `${householdId}-commitment-${crypto.randomUUID()}`,
          householdId,
          accountId: body.accountId,
          type: body.type,
          name: body.name,
          amount: body.amount,
          billingFrequency: body.billingFrequency,
          nextDueDate: body.nextDueDate,
          status: 'ACTIVE',
          provider: typeof body.provider === 'string' ? body.provider : null,
          policyNumber: typeof body.policyNumber === 'string' ? body.policyNumber : null,
          insuredObject: typeof body.insuredObject === 'string' ? body.insuredObject : null,
          sumInsured: typeof body.sumInsured === 'string' ? body.sumInsured : null,
          principal: typeof body.principal === 'string' ? body.principal : null,
          outstandingBalance: typeof body.outstandingBalance === 'string' ? body.outstandingBalance : null,
          interestRate: typeof body.interestRate === 'string' ? body.interestRate : null,
          termMonths: typeof body.termMonths === 'number' ? body.termMonths : null,
          lastUsedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        access.entry.commitments.push(commitment);
        return respond(req, res, 201, commitment);
      })
      .catch(() => respond(req, res, 400, { error: 'Invalid JSON body' }));
  }

  const householdTransactionsMatch = url.match(/^\/households\/([^/]+)\/transactions$/);
  if (householdTransactionsMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId] = householdTransactionsMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    const params = new URLSearchParams(rawUrl.split('?')[1] ?? '');
    const limit = params.has('limit') ? Number.parseInt(params.get('limit'), 10) : 50;
    const sorted = [...access.entry.transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const { moneyIn, moneyOut } = moneySummary(access.entry);
    return respond(req, res, 200, { data: sorted.slice(0, limit), total: sorted.length, page: 1, limit, moneyIn, moneyOut });
  }

  if (householdTransactionsMatch && method === 'POST') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId] = householdTransactionsMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    return readJsonBody(req)
      .then((body) => {
        if (typeof body.accountId !== 'string' || typeof body.payee !== 'string' || typeof body.amount !== 'string' || typeof body.date !== 'string') {
          return respond(req, res, 400, { error: 'accountId, payee, amount and date are required' });
        }
        const now = new Date().toISOString();
        const transaction = serializeHouseholdTransaction({
          id: `${householdId}-transaction-${crypto.randomUUID()}`,
          householdId,
          accountId: body.accountId,
          categoryId: typeof body.categoryId === 'string' ? body.categoryId : null,
          payee: body.payee,
          payerUserId: typeof body.payerUserId === 'string' ? body.payerUserId : null,
          amount: body.amount,
          date: body.date,
          tag: typeof body.tag === 'string' ? body.tag : null,
          note: typeof body.note === 'string' ? body.note : null,
          isRecurring: body.isRecurring === true,
          createdAt: now,
          updatedAt: now,
        });
        access.entry.transactions.push(transaction);
        return respond(req, res, 201, transaction);
      })
      .catch(() => respond(req, res, 400, { error: 'Invalid JSON body' }));
  }

  const householdTransactionDetailMatch = url.match(/^\/households\/([^/]+)\/transactions\/([^/]+)$/);
  if (householdTransactionDetailMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId, transactionId] = householdTransactionDetailMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    const transaction = access.entry.transactions.find((item) => item.id === transactionId);
    if (!transaction) return respond(req, res, 404, { error: 'Not found' });
    return respond(req, res, 200, transaction);
  }

  if (householdTransactionDetailMatch && method === 'PATCH') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId, transactionId] = householdTransactionDetailMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    /** @type {Array<Record<string, unknown>>} */
    const transactions = access.entry.transactions;
    const transaction = transactions.find((item) => item.id === transactionId);
    if (!transaction) return respond(req, res, 404, { error: 'Not found' });

    return readJsonBody(req)
      .then((body) => {
        const supportedFields = ['payee', 'categoryId', 'tag', 'note', 'date'];
        const unsupportedFields = Object.keys(body).filter((field) => !supportedFields.includes(field));
        if (unsupportedFields.length > 0) {
          return respond(req, res, 400, { error: `Unsupported transaction fields: ${unsupportedFields.join(', ')}` });
        }
        if (Object.prototype.hasOwnProperty.call(body, 'payee') && (typeof body.payee !== 'string' || body.payee.trim().length === 0)) {
          return respond(req, res, 400, { error: 'payee must be a non-empty string' });
        }
        for (const nullableField of ['categoryId', 'tag', 'note']) {
          if (Object.prototype.hasOwnProperty.call(body, nullableField) && body[nullableField] !== null && typeof body[nullableField] !== 'string') {
            return respond(req, res, 400, { error: `${nullableField} must be a string or null` });
          }
        }
        if (Object.prototype.hasOwnProperty.call(body, 'date') && (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date))) {
          return respond(req, res, 400, { error: 'date must use YYYY-MM-DD format' });
        }

        for (const field of supportedFields) {
          if (Object.prototype.hasOwnProperty.call(body, field)) transaction[field] = body[field];
        }
        transaction.updatedAt = new Date().toISOString();
        return respond(req, res, 200, transaction);
      })
      .catch(() => respond(req, res, 400, { error: 'Invalid JSON body' }));
  }

  const householdTransfersMatch = url.match(/^\/households\/([^/]+)\/transfers$/);
  if (householdTransfersMatch && method === 'POST') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, householdId] = householdTransfersMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    return readJsonBody(req)
      .then((body) => {
        if (typeof body.fromAccountId !== 'string' || typeof body.toAccountId !== 'string' || typeof body.amount !== 'string' || typeof body.date !== 'string') {
          return respond(req, res, 400, { error: 'fromAccountId, toAccountId, amount and date are required' });
        }
        const now = new Date().toISOString();
        const transferGroupId = `${householdId}-transfer-${crypto.randomUUID()}`;
        const payee = typeof body.payee === 'string' && body.payee.length > 0 ? body.payee : 'Przelew między kontami';
        const outgoing = serializeHouseholdTransaction({
          id: `${transferGroupId}-out`,
          householdId,
          accountId: body.fromAccountId,
          amount: `-${body.amount}`,
          date: body.date,
          payee,
          note: typeof body.note === 'string' ? body.note : null,
          transferGroupId,
          createdAt: now,
          updatedAt: now,
        });
        const incoming = serializeHouseholdTransaction({
          id: `${transferGroupId}-in`,
          householdId,
          accountId: body.toAccountId,
          amount: body.amount,
          date: body.date,
          payee,
          note: typeof body.note === 'string' ? body.note : null,
          transferGroupId,
          createdAt: now,
          updatedAt: now,
        });
        access.entry.transactions.push(outgoing, incoming);
        return respond(req, res, 201, [outgoing, incoming]);
      })
      .catch(() => respond(req, res, 400, { error: 'Invalid JSON body' }));
  }

  const householdDashboardMatch = url.match(/^\/households\/([^/]+)\/dashboard$/);
  if (householdDashboardMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    if (authToken === HOUSEHOLD_DATA_FAILURE_TOKEN) return respond(req, res, 503, { error: 'Household dashboard unavailable' });
    const [, householdId] = householdDashboardMatch;
    const access = requireHouseholdMember(householdId, authToken);
    if (access.status !== 200) return respond(req, res, access.status, access.body);
    const { entry, member } = access;
    const accounts = listVisibleAccounts(entry, member.userId);
    const netWorth = accounts.reduce((sum, account) => sum + Number.parseFloat(account.balance), 0);
    const { moneyIn, moneyOut } = moneySummary(entry);
    const upcomingCommitments = entry.commitments
      .filter((commitment) => commitment.status === 'ACTIVE')
      .sort((a, b) => (a.nextDueDate < b.nextDueDate ? -1 : 1))
      .map((commitment) => ({
        id: commitment.id,
        name: commitment.name,
        type: commitment.type,
        amount: commitment.amount,
        nextDueDate: commitment.nextDueDate,
        daysUntilDue: Math.max(0, Math.round((new Date(commitment.nextDueDate).getTime() - Date.now()) / 86_400_000)),
      }));
    return respond(req, res, 200, {
      accounts,
      safeToSpend: (Number.parseFloat(moneyIn) - Number.parseFloat(moneyOut)).toFixed(2),
      moneyIn,
      moneyOut,
      netWorth: netWorth.toFixed(2),
      netWorthChangePercent: '0.0',
      savingsRatePercent: '0.0',
      savingsAmountThisMonth: '0.00',
      envelopes: entry.envelopes.map((envelope) => serializeHouseholdEnvelope(entry, envelope)),
      upcomingCommitments,
      monthlyInOut: [{ month: new Date().toISOString().slice(0, 7), income: moneyIn, expense: moneyOut }],
    });
  }

  respond(req, res, 404, { error: 'Not found' });
});

const PORT = process.env.MOCK_API_PORT ? parseInt(process.env.MOCK_API_PORT, 10) : 3099;

server.listen(PORT, () => {
  console.log(`Mock API listening on http://localhost:${PORT}`);
});

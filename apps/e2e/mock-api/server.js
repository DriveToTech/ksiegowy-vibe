// @ts-check
'use strict';

const http = require('http');
const crypto = require('crypto');

const TEST_USER = {
  id: 'test-user-id',
  email: 'demo.operator@example.test',
  name: 'Alex Example',
  avatarUrl: null,
};

const TEST_COMPANY = {
  id: 'test-company-id',
  name: 'Northstar Demo Ledger LLC',
  nip: 'TEST-NIP-0000',
  addressLine1: '1 Example Lane, Demo City, TEST-0000',
  addressLine2: null,
  email: 'hello@northstar-demo.example.test',
  phone: '+00 000 000 000',
  bankName: 'Example Test Bank',
  bankAccount: 'TEST-ACCOUNT-0000',
  vatStatus: 'ACTIVE',
  ksefEnv: 'TEST',
  invoiceNumberPattern: 'DEMO-{YEAR}-{SEQ}',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-08-30T00:00:00.000Z',
};

const TEST_CONTRACTOR = {
  id: 'test-contractor-id',
  companyId: 'test-company-id',
  name: 'Bluebird Example Studio LLC',
  nip: 'TEST-NIP-0001',
  pesel: null,
  addressLine1: '22 Fictional Street, Sample Town, TEST-0001',
  addressLine2: null,
  countryCode: 'XX',
  email: 'accounts@bluebird-example.example.test',
  phone: '+00 111 222 333',
  bankAccount: 'TEST-ACCOUNT-0001',
  notes: 'Synthetic contractor used only for screenshots.',
  isActive: true,
  turnover: '18450.00',
  turnoverYear: 2026,
  createdAt: '2026-01-04T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
};

const SECOND_TEST_CONTRACTOR = {
  id: 'test-contractor-second-id',
  companyId: 'test-company-id',
  name: 'Juniper Fictional Works LLC',
  nip: 'TEST-NIP-0002',
  pesel: null,
  addressLine1: '7 Placeholder Avenue, Demo Borough, TEST-0002',
  addressLine2: 'Suite 404',
  countryCode: 'XX',
  email: 'billing@juniper-fictional.example.test',
  phone: '+00 444 555 666',
  bankAccount: 'TEST-ACCOUNT-0002',
  notes: 'Synthetic contractor used only for screenshots.',
  isActive: true,
  turnover: '9275.00',
  turnoverYear: 2026,
  createdAt: '2026-02-02T00:00:00.000Z',
  updatedAt: '2026-08-18T00:00:00.000Z',
};

const TEST_CONTRACTORS = [TEST_CONTRACTOR, SECOND_TEST_CONTRACTOR];

const TEST_SERVICE_TEMPLATES = [
  {
    id: 'test-service-template-id',
    companyId: TEST_COMPANY.id,
    name: 'Demo bookkeeping package',
    unit: 'hour',
    vatRate: '23',
    description: 'Synthetic monthly bookkeeping work.',
    isActive: true,
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
  },
  {
    id: 'test-service-template-review-id',
    companyId: TEST_COMPANY.id,
    name: 'Fictional VAT review',
    unit: 'service',
    vatRate: '23',
    description: 'Synthetic compliance review for the demo workspace.',
    isActive: true,
    createdAt: '2026-02-10T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
  },
  {
    id: 'test-service-template-archived-id',
    companyId: TEST_COMPANY.id,
    name: 'Archived demo payroll review',
    unit: 'hour',
    vatRate: '8',
    description: 'Inactive synthetic catalogue item.',
    isActive: false,
    createdAt: '2026-03-03T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
  },
];

const TEST_SERVICE_TEMPLATE = TEST_SERVICE_TEMPLATES[0];

const TEST_CONTRACTOR_SERVICE_RATES = [
  {
    id: 'test-service-rate-id',
    contractorId: TEST_CONTRACTOR.id,
    serviceTemplateId: TEST_SERVICE_TEMPLATES[0].id,
    unitNetPrice: '250.00',
    currency: 'PLN',
    createdAt: '2026-01-08T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    serviceTemplate: TEST_SERVICE_TEMPLATES[0],
  },
  {
    id: 'test-service-rate-review-id',
    contractorId: TEST_CONTRACTOR.id,
    serviceTemplateId: TEST_SERVICE_TEMPLATES[1].id,
    unitNetPrice: '480.00',
    currency: 'PLN',
    createdAt: '2026-02-12T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
    serviceTemplate: TEST_SERVICE_TEMPLATES[1],
  },
];

const DEMO_NOW = new Date();

/**
 * @param {number} monthOffset
 * @param {number} day
 * @returns {string}
 */
function demoDate(monthOffset, day) {
  return new Date(Date.UTC(DEMO_NOW.getUTCFullYear(), DEMO_NOW.getUTCMonth() + monthOffset, day)).toISOString().slice(0, 10);
}

/**
 * @param {number} monthOffset
 * @param {number} day
 * @param {number} hour
 * @returns {string}
 */
function demoTimestamp(monthOffset, day, hour) {
  return new Date(Date.UTC(DEMO_NOW.getUTCFullYear(), DEMO_NOW.getUTCMonth() + monthOffset, day, hour)).toISOString();
}

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

const BASE_INVOICE_TIMESTAMPS = {
  createdAt: demoTimestamp(0, 1, 9),
  updatedAt: demoTimestamp(0, 1, 9),
};

const ACCEPTED_INVOICE_ID = 'accepted-invoice-id';
const TEST_REPORT_ID = 'test-compliance-report-id';

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
    invoiceNumber: 'DEMO-INV-001',
    status: 'ISSUED',
    invoiceType: 'VAT',
    issueDate: demoDate(0, 10),
    saleDate: demoDate(0, 10),
    placeOfIssue: 'Demo City',
    sellerName: TEST_COMPANY.name,
    sellerNip: TEST_COMPANY.nip,
    buyerName: TEST_CONTRACTOR.name,
    buyerNip: TEST_CONTRACTOR.nip,
    totalNet: '500.00',
    totalVat: '115.00',
    totalGross: '615.00',
    paymentReceived: '0.00',
    paymentMethod: 'BANK_TRANSFER',
    paymentDueDate: demoDate(0, 24),
    currency: 'PLN',
    notes: 'Synthetic invoice for the screenshot runtime.',
    correctedInvoiceNumber: null,
    correctionMode: null,
    correctionReason: null,
    correctionImpactType: null,
    correctedInvoice: null,
    ksefStatus: 'accepted',
    ksefReference: 'TEST-KSEF-REF-ALPHA-0001',
    issuedAt: demoTimestamp(0, 10, 12),
    ...BASE_INVOICE_TIMESTAMPS,
    lines: [
      {
        id: `${invoiceId}-line-1`,
        position: 1,
        name: TEST_SERVICE_TEMPLATE.name,
        unit: TEST_SERVICE_TEMPLATE.unit,
        quantity: '2',
        unitNetPrice: '250.00',
        vatRate: '23',
        netValue: '500.00',
        vatValue: '115.00',
        grossValue: '615.00',
      },
    ],
    vatBreakdown: [
      {
        id: `${invoiceId}-vat-1`,
        vatRate: '23',
        netAmount: '500.00',
        vatAmount: '115.00',
      },
    ],
    ...overrides,
  };
}

/** @type {Map<string, Record<string, unknown>>} */
const invoices = new Map([
  [ACCEPTED_INVOICE_ID, createInvoice(ACCEPTED_INVOICE_ID, {
    invoiceNumber: 'DEMO-INV-008',
    issueDate: demoDate(0, 12),
    saleDate: demoDate(0, 12),
    totalNet: '1250.00',
    totalVat: '287.50',
    totalGross: '1537.50',
    paymentReceived: '600.00',
    paymentDueDate: demoDate(0, 26),
    createdAt: demoTimestamp(0, 12, 9),
    updatedAt: demoTimestamp(0, 12, 9),
    lines: [{
      id: `${ACCEPTED_INVOICE_ID}-line-1`, position: 1, name: TEST_SERVICE_TEMPLATES[0].name, unit: 'hour', quantity: '5',
      unitNetPrice: '250.00', vatRate: '23', netValue: '1250.00', vatValue: '287.50', grossValue: '1537.50',
    }],
    vatBreakdown: [{ id: `${ACCEPTED_INVOICE_ID}-vat-1`, vatRate: '23', netAmount: '1250.00', vatAmount: '287.50' }],
  })],
  ['pending-invoice-id', createInvoice('pending-invoice-id', {
    invoiceNumber: 'DEMO-INV-007',
    issueDate: demoDate(0, 8),
    saleDate: demoDate(0, 8),
    contractorId: SECOND_TEST_CONTRACTOR.id,
    buyerName: SECOND_TEST_CONTRACTOR.name,
    buyerNip: SECOND_TEST_CONTRACTOR.nip,
    totalNet: '800.00',
    totalVat: '184.00',
    totalGross: '984.00',
    ksefStatus: 'pending',
    ksefReference: null,
    createdAt: demoTimestamp(0, 8, 10),
    updatedAt: demoTimestamp(0, 8, 10),
    lines: [{
      id: 'pending-invoice-id-line-1', position: 1, name: TEST_SERVICE_TEMPLATES[1].name, unit: 'service', quantity: '1',
      unitNetPrice: '800.00', vatRate: '23', netValue: '800.00', vatValue: '184.00', grossValue: '984.00',
    }],
    vatBreakdown: [{ id: 'pending-invoice-id-vat-1', vatRate: '23', netAmount: '800.00', vatAmount: '184.00' }],
  })],
  ['rejected-invoice-id', createInvoice('rejected-invoice-id', {
    invoiceNumber: 'DEMO-INV-006',
    issueDate: demoDate(-1, 19),
    saleDate: demoDate(-1, 19),
    totalNet: '320.00',
    totalVat: '73.60',
    totalGross: '393.60',
    ksefStatus: 'rejected',
    ksefReference: 'TEST-KSEF-REJECTED-0001',
    createdAt: demoTimestamp(-1, 19, 11),
    updatedAt: demoTimestamp(-1, 19, 11),
    lines: [{
      id: 'rejected-invoice-id-line-1', position: 1, name: TEST_SERVICE_TEMPLATES[0].name, unit: 'hour', quantity: '1',
      unitNetPrice: '320.00', vatRate: '23', netValue: '320.00', vatValue: '73.60', grossValue: '393.60',
    }],
    vatBreakdown: [{ id: 'rejected-invoice-id-vat-1', vatRate: '23', netAmount: '320.00', vatAmount: '73.60' }],
  })],
  ['not-submitted-invoice-id', createInvoice('not-submitted-invoice-id', {
    invoiceNumber: 'DEMO-INV-005',
    issueDate: demoDate(-2, 14),
    saleDate: demoDate(-2, 14),
    totalNet: '450.00',
    totalVat: '103.50',
    totalGross: '553.50',
    ksefStatus: 'not_submitted',
    ksefReference: null,
    createdAt: demoTimestamp(-2, 14, 14),
    updatedAt: demoTimestamp(-2, 14, 14),
    lines: [{
      id: 'not-submitted-invoice-id-line-1', position: 1, name: TEST_SERVICE_TEMPLATES[0].name, unit: 'hour', quantity: '2',
      unitNetPrice: '225.00', vatRate: '23', netValue: '450.00', vatValue: '103.50', grossValue: '553.50',
    }],
    vatBreakdown: [{ id: 'not-submitted-invoice-id-vat-1', vatRate: '23', netAmount: '450.00', vatAmount: '103.50' }],
  })],
  ['draft-invoice-id', createInvoice('draft-invoice-id', {
    invoiceNumber: null,
    status: 'DRAFT',
    issueDate: demoDate(0, 20),
    saleDate: demoDate(0, 19),
    totalNet: '960.00',
    totalVat: '220.80',
    totalGross: '1180.80',
    paymentDueDate: demoDate(0, 34),
    ksefStatus: 'not_submitted',
    ksefReference: null,
    issuedAt: null,
    createdAt: demoTimestamp(0, 20, 15),
    updatedAt: demoTimestamp(0, 20, 15),
    notes: 'Draft prepared for the demo presentation.',
    lines: [{
      id: 'draft-invoice-id-line-1', position: 1, name: TEST_SERVICE_TEMPLATES[0].name, unit: 'hour', quantity: '4',
      unitNetPrice: '240.00', vatRate: '23', netValue: '960.00', vatValue: '220.80', grossValue: '1180.80',
    }],
    vatBreakdown: [{ id: 'draft-invoice-id-vat-1', vatRate: '23', netAmount: '960.00', vatAmount: '220.80' }],
  })],
]);

/**
 * @param {string | null | undefined} contractorId
 * @returns {{ id: string, name: string, nip: string | null } | null}
 */
function contractorListItem(contractorId) {
  const contractor = TEST_CONTRACTORS.find((item) => item.id === contractorId);
  return contractor ? { id: contractor.id, name: contractor.name, nip: contractor.nip } : null;
}

/**
 * @param {Record<string, unknown>} invoice
 * @returns {Record<string, unknown>}
 */
function serializeInvoiceSummary(invoice) {
  return {
    id: invoice.id,
    companyId: invoice.companyId,
    environment: invoice.environment,
    contractorId: invoice.contractorId,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    invoiceType: invoice.invoiceType,
    issueDate: invoice.issueDate,
    totalNet: invoice.totalNet,
    totalVat: invoice.totalVat,
    totalGross: invoice.totalGross,
    currency: invoice.currency,
    ksefStatus: invoice.ksefStatus,
    issuedAt: invoice.issuedAt,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
    contractor: contractorListItem(typeof invoice.contractorId === 'string' ? invoice.contractorId : null),
  };
}

function createDashboardSummary() {
  const outgoingInvoices = Array.from(invoices.values()).sort((firstInvoice, secondInvoice) =>
    String(secondInvoice.createdAt).localeCompare(String(firstInvoice.createdAt)));
  const issuedInvoices = outgoingInvoices.filter((invoice) => invoice.status === 'ISSUED');
  const ksefCounts = {
    accepted: issuedInvoices.filter((invoice) => invoice.ksefStatus === 'accepted').length,
    pending: issuedInvoices.filter((invoice) => invoice.ksefStatus === 'pending').length,
    rejected: issuedInvoices.filter((invoice) => invoice.ksefStatus === 'rejected').length,
    notSubmitted: issuedInvoices.filter((invoice) => invoice.ksefStatus === 'not_submitted').length,
  };
  const monthBuckets = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(DEMO_NOW.getUTCFullYear(), DEMO_NOW.getUTCMonth() - (5 - index), 1));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, gross: 0, vat: 0, invoiceCount: 0 };
  });

  for (const invoice of issuedInvoices.filter((item) => item.ksefStatus === 'accepted')) {
    const date = new Date(invoice.issueDate);
    const bucket = monthBuckets.find((item) => item.year === date.getUTCFullYear() && item.month === date.getUTCMonth() + 1);
    if (!bucket) continue;
    bucket.gross += Number(invoice.totalGross);
    bucket.vat += Number(invoice.totalVat);
    bucket.invoiceCount += 1;
  }

  const currentMonth = monthBuckets[monthBuckets.length - 1];
  const incomingNeedsAction = Array.from(incomingInvoices.values()).filter((invoice) =>
    ['UPLOADED', 'OCR_PROCESSING', 'OCR_DONE', 'OCR_FAILED'].includes(invoice.status)).length;

  return {
    environment: 'TEST',
    totalInvoices: outgoingInvoices.length,
    contractorCount: TEST_CONTRACTORS.length,
    ksefCounts,
    salesByMonth: monthBuckets.map((bucket) => ({
      ...bucket,
      gross: bucket.gross.toFixed(2),
      vat: bucket.vat.toFixed(2),
    })),
    currentMonth: {
      gross: currentMonth.gross.toFixed(2),
      vat: currentMonth.vat.toFixed(2),
      invoiceCount: currentMonth.invoiceCount,
    },
    attention: {
      rejected: ksefCounts.rejected,
      notSubmitted: ksefCounts.notSubmitted,
      incoming: incomingNeedsAction,
    },
    recentInvoices: outgoingInvoices.slice(0, 6).map(serializeInvoiceSummary),
  };
}

function serviceRateListForContractor(contractorId) {
  return TEST_CONTRACTOR_SERVICE_RATES.filter((rate) => rate.contractorId === contractorId);
}

function createIncomingInvoice(invoiceId, overrides = {}) {
  const contractor = TEST_CONTRACTOR;
  return {
    id: invoiceId,
    companyId: TEST_COMPANY.id,
    environment: 'TEST',
    contractorId: contractor.id,
    status: 'OCR_DONE',
    sellerName: contractor.name,
    sellerNip: contractor.nip,
    sellerAddress: contractor.addressLine1,
    buyerName: TEST_COMPANY.name,
    buyerNip: TEST_COMPANY.nip,
    invoiceNumber: 'INCOMING-DEMO-001',
    issueDate: demoDate(0, 7),
    saleDate: demoDate(0, 6),
    totalNet: '300.00',
    totalVat: '69.00',
    totalGross: '369.00',
    currency: 'PLN',
    paymentMethod: 'BANK_TRANSFER',
    dueDate: demoDate(0, 21),
    bankAccount: 'TEST-ACCOUNT-0001',
    notes: 'Synthetic incoming invoice for OCR review screenshots.',
    ocrConfidence: 0.97,
    ocrModel: 'demo-ocr-engine-v1',
    ocrError: null,
    ksefReference: null,
    ksefEnvironment: null,
    confirmedAt: null,
    createdAt: demoTimestamp(0, 7, 10),
    updatedAt: demoTimestamp(0, 7, 10),
    contractor: contractorListItem(contractor.id),
    fileRecords: [],
    ...overrides,
  };
}

/** @type {Map<string, Record<string, unknown>>} */
const incomingInvoices = new Map([
  ['incoming-ocr-review-id', createIncomingInvoice('incoming-ocr-review-id', {
    invoiceNumber: 'INCOMING-DEMO-004',
    issueDate: demoDate(0, 7),
    saleDate: demoDate(0, 6),
    createdAt: demoTimestamp(0, 7, 10),
    updatedAt: demoTimestamp(0, 7, 10),
    fileRecords: [{
      id: 'demo-incoming-scan-id', type: 'incoming_scan', mimeType: 'text/html', sizeBytes: 4821,
      createdAt: demoTimestamp(0, 7, 10),
    }],
  })],
  ['incoming-processing-id', createIncomingInvoice('incoming-processing-id', {
    status: 'OCR_PROCESSING',
    invoiceNumber: null,
    issueDate: demoDate(-1, 21),
    saleDate: null,
    totalNet: null,
    totalVat: null,
    totalGross: null,
    ocrConfidence: null,
    ocrModel: null,
    createdAt: demoTimestamp(-1, 21, 9),
    updatedAt: demoTimestamp(-1, 21, 9),
  })],
  ['incoming-confirmed-id', createIncomingInvoice('incoming-confirmed-id', {
    status: 'CONFIRMED',
    invoiceNumber: 'INCOMING-DEMO-003',
    issueDate: demoDate(-2, 13),
    saleDate: demoDate(-2, 12),
    totalNet: '420.00',
    totalVat: '96.60',
    totalGross: '516.60',
    confirmedAt: demoTimestamp(-2, 13, 12),
    createdAt: demoTimestamp(-2, 13, 12),
    updatedAt: demoTimestamp(-2, 13, 12),
  })],
  ['incoming-synced-id', createIncomingInvoice('incoming-synced-id', {
    status: 'KSEF_SYNCED',
    invoiceNumber: 'INCOMING-DEMO-002',
    issueDate: demoDate(-3, 9),
    saleDate: demoDate(-3, 8),
    totalNet: '180.00',
    totalVat: '41.40',
    totalGross: '221.40',
    ksefReference: 'TEST-KSEF-INCOMING-0002',
    ksefEnvironment: 'TEST',
    createdAt: demoTimestamp(-3, 9, 8),
    updatedAt: demoTimestamp(-3, 9, 8),
  })],
]);

const TEST_KSEF_SETTINGS = {
  defaultEnvironment: 'TEST',
  credentials: [
    { environment: 'TEST', hasToken: true },
    { environment: 'PRODUCTION', hasToken: false },
  ],
};

const TEST_BACKUP_SETTINGS = {
  companyId: TEST_COMPANY.id,
  provider: 'GOOGLE_DRIVE',
  googleDrive: {
    isConnected: true,
    requiresReauthorization: false,
    expiresAt: demoTimestamp(1, 28, 23),
    lastBackupAt: DEMO_NOW.toISOString(),
  },
  policy: {
    provider: 'GOOGLE_DRIVE',
    automaticOnInvoiceIssued: true,
    scheduleMode: 'DAILY',
    scheduleHour: 2,
    scheduleMinute: 30,
    scheduleDayOfWeek: null,
    scheduleTimezone: 'UTC',
    updatedAt: demoTimestamp(0, 2, 8),
  },
  platformPostgresqlBackupFreshness: {
    status: 'FRESH',
    latestArtifactTimestamp: DEMO_NOW.toISOString(),
    latestArtifactCreatedAt: DEMO_NOW.toISOString(),
    latestArtifactAgeHours: 1,
    maxAllowedAgeHours: 24,
    checkedAt: DEMO_NOW.toISOString(),
  },
};

const TEST_BACKUP_STATUS = {
  companyId: TEST_COMPANY.id,
  evaluatedAt: DEMO_NOW.toISOString(),
  overallStatus: 'HEALTHY',
  platformPostgresql: {
    status: 'FRESH',
    severity: 'INFO',
    isPlatformManaged: true,
    summary: 'Synthetic PostgreSQL backup artifact is recent and complete.',
    latestArtifactTimestamp: DEMO_NOW.toISOString(),
    latestArtifactCreatedAt: DEMO_NOW.toISOString(),
    latestArtifactAgeHours: 1,
    maxAllowedAgeHours: 24,
    checkedAt: DEMO_NOW.toISOString(),
    reasonCode: 'OK',
  },
  companyGoogleDrive: {
    connectionStatus: 'CONNECTED',
    lastBackupAt: DEMO_NOW.toISOString(),
    isPolicyAutomationEnabled: true,
    summary: 'Synthetic Google Drive connection is ready for demo backups.',
  },
};

const TEST_MEMBER = {
  id: 'test-member-id',
  userId: 'test-user-id',
  companyId: 'test-company-id',
  role: 'ADMIN',
  user: TEST_USER,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const TEST_ACCOUNTANT_MEMBER = {
  id: 'test-accountant-member-id',
  userId: 'test-accountant-user-id',
  companyId: TEST_COMPANY.id,
  role: 'ACCOUNTANT',
  user: {
    id: 'test-accountant-user-id',
    email: 'morgan.bookkeeper@example.test',
    name: 'Morgan Example',
    avatarUrl: null,
  },
  createdAt: '2026-02-01T00:00:00.000Z',
};

const TEST_INVITE = {
  id: 'test-invite-id',
  email: 'reviewer@example.test',
  role: 'VIEWER',
  expiresAt: demoTimestamp(0, 30, 23),
  createdAt: demoTimestamp(0, 23, 10),
};

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
    const refreshToken = cookies['refresh_token'];
    if (!authToken && refreshToken !== 'test-refresh-token') return respond(req, res, 401, { error: 'Unauthorized' });
    const refreshedToken = authToken
      ? (authToken.endsWith('::refreshed') ? authToken : `${authToken}::refreshed`)
      : 'test-token';
    return respond(req, res, 200, { ok: true }, { 'Set-Cookie': `auth_token=${refreshedToken}; Path=/; SameSite=Lax` });
  }

  if (url === '/auth/me' && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const onboardingCompany = isTestCompanyToken ? null : findOnboardingCompanyByToken(authToken);
    const memberHouseholds = [...households.values()]
      .filter((entry) => entry.members.has(authToken))
      .map((entry) => ({ id: entry.household.id, role: entry.members.get(authToken).role, name: entry.household.name }));
    return respond(req, res, 200, {
      authenticated: true,
      user: TEST_USER,
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
      name: `Registry Demo Company ${nip}`,
      nip,
      addressLine1: '10 Registry Way, Demo City, TEST-0004',
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
    if (companyId === TEST_COMPANY.id) return respond(req, res, 200, TEST_KSEF_SETTINGS);
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
    if (companyId === TEST_COMPANY.id) {
      return readJsonBody(req)
        .then((body) => {
          if (typeof body.ksefToken !== 'string' || body.ksefToken.length === 0) {
            return respond(req, res, 400, { error: 'ksefToken is required' });
          }
          const credential = TEST_KSEF_SETTINGS.credentials.find((item) => item.environment === environment);
          if (credential) credential.hasToken = true;
          return respond(req, res, 200, {});
        })
        .catch(() => respond(req, res, 400, { error: 'Invalid JSON body' }));
    }
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

  if (/^\/companies\/[^/]+$/.test(url) && method === 'PATCH') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, companyId] = url.match(/^\/companies\/([^/]+)$/) ?? [];
    if (companyId !== TEST_COMPANY.id) return respond(req, res, 404, { error: 'Not found' });
    return readJsonBody(req)
      .then((body) => {
        for (const field of ['name', 'addressLine1', 'addressLine2', 'email', 'phone', 'bankName', 'bankAccount', 'invoiceNumberPattern']) {
          if (Object.prototype.hasOwnProperty.call(body, field)) TEST_COMPANY[field] = body[field];
        }
        TEST_COMPANY.updatedAt = DEMO_NOW.toISOString();
        return respond(req, res, 200, TEST_COMPANY);
      })
      .catch(() => respond(req, res, 400, { error: 'Invalid JSON body' }));
  }

  if (/^\/companies\/[^/]+\/dashboard-summary$/.test(url) && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    return respond(req, res, 200, createDashboardSummary());
  }

  if (/^\/companies\/[^/]+\/invoices$/.test(url) && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const searchParameters = new URLSearchParams(rawUrl.split('?')[1] ?? '');
    const requestedPage = Number(searchParameters.get('page'));
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const requestedLimit = Number(searchParameters.get('limit'));
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : 20;
    const status = searchParameters.get('status');
    const ksefStatus = searchParameters.get('ksefStatus');
    const filteredInvoices = Array.from(invoices.values())
      .filter((invoice) => !status || invoice.status === status)
      .filter((invoice) => !ksefStatus || invoice.ksefStatus === ksefStatus)
      .sort((firstInvoice, secondInvoice) => String(secondInvoice.createdAt).localeCompare(String(firstInvoice.createdAt)));
    const startIndex = (page - 1) * limit;
    return respond(req, res, 200, {
      data: filteredInvoices.slice(startIndex, startIndex + limit).map(serializeInvoiceSummary),
      total: filteredInvoices.length,
      page,
      limit,
    });
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

  const invoiceUpdateMatch = url.match(/^\/companies\/([^/]+)\/invoices\/([^/]+)$/);
  if (invoiceUpdateMatch && method === 'PUT') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, companyId, invoiceId] = invoiceUpdateMatch;
    if (companyId !== TEST_COMPANY.id) return respond(req, res, 404, { error: 'Not found' });
    const invoice = invoices.get(invoiceId);
    if (!invoice) return respond(req, res, 404, { error: 'Not found' });
    if (invoice.status !== 'DRAFT') return respond(req, res, 409, { error: 'Invoice is not in DRAFT status' });
    return readJsonBody(req)
      .then((body) => {
        const updatedInvoice = {
          ...invoice,
          contractorId: typeof body.contractorId === 'string' ? body.contractorId : invoice.contractorId,
          issueDate: typeof body.issueDate === 'string' ? body.issueDate : invoice.issueDate,
          saleDate: typeof body.saleDate === 'string' ? body.saleDate : invoice.saleDate,
          paymentDueDate: typeof body.paymentDueDate === 'string' ? body.paymentDueDate : invoice.paymentDueDate,
          paymentMethod: typeof body.paymentMethod === 'string' ? body.paymentMethod : invoice.paymentMethod,
          currency: typeof body.currency === 'string' ? body.currency : invoice.currency,
          notes: typeof body.notes === 'string' ? body.notes : invoice.notes,
          updatedAt: DEMO_NOW.toISOString(),
        };
        invoices.set(invoiceId, updatedInvoice);
        return respond(req, res, 200, updatedInvoice);
      })
      .catch(() => respond(req, res, 400, { error: 'Invalid JSON body' }));
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
           issueDate: demoDate(0, 22),
           saleDate: demoDate(0, 12),
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
               name: TEST_SERVICE_TEMPLATE.name,
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
           updatedAt: demoTimestamp(0, 22, 9),
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
       invoiceNumber: 'KOR-DEMO-001',
      status: 'ISSUED',
       issuedAt: demoTimestamp(0, 22, 9),
       updatedAt: demoTimestamp(0, 22, 9),
    };

    invoices.set(invoiceId, issuedInvoice);

    return respond(req, res, 200, issuedInvoice);
  }

  if (/^\/companies\/[^/]+\/contractors$/.test(url) && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const searchParameters = new URLSearchParams(rawUrl.split('?')[1] ?? '');
    const status = searchParameters.get('status');
    const filteredContractors = TEST_CONTRACTORS.filter((contractor) =>
      status === 'inactive' ? !contractor.isActive : status === 'active' ? contractor.isActive : true,
    );
    return respond(req, res, 200, filteredContractors);
  }

  const contractorDetailMatch = url.match(/^\/companies\/([^/]+)\/contractors\/([^/]+)$/);
  if (contractorDetailMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, companyId, contractorId] = contractorDetailMatch;
    if (companyId !== TEST_COMPANY.id) return respond(req, res, 404, { error: 'Not found' });
    const contractor = TEST_CONTRACTORS.find((item) => item.id === contractorId);
    return contractor ? respond(req, res, 200, contractor) : respond(req, res, 404, { error: 'Not found' });
  }

  const contractorSummaryMatch = url.match(/^\/companies\/([^/]+)\/contractors\/([^/]+)\/summary$/);
  if (contractorSummaryMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, companyId, contractorId] = contractorSummaryMatch;
    if (companyId !== TEST_COMPANY.id) return respond(req, res, 404, { error: 'Not found' });
    const contractor = TEST_CONTRACTORS.find((item) => item.id === contractorId);
    if (!contractor) return respond(req, res, 404, { error: 'Not found' });
    const contractorInvoices = Array.from(invoices.values()).filter((invoice) => invoice.contractorId === contractorId);
    return respond(req, res, 200, {
      contractorId,
      year: contractor.turnoverYear,
      turnover: contractor.turnover,
      paidThisYear: '600.00',
      outstanding: '937.50',
      recentDocuments: contractorInvoices.slice(0, 3).map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceType: invoice.invoiceType,
        issueDate: invoice.issueDate,
        totalGross: invoice.totalGross,
      })),
    });
  }

  if (/^\/companies\/[^/]+\/contractors\/[^/]+\/service-rates$/.test(url) && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, , contractorId] = url.match(/^\/companies\/([^/]+)\/contractors\/([^/]+)\/service-rates$/) ?? [];
    return respond(req, res, 200, serviceRateListForContractor(contractorId));
  }

  if (/^\/companies\/[^/]+\/service-templates$/.test(url) && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const searchParameters = new URLSearchParams(rawUrl.split('?')[1] ?? '');
    const includeInactive = searchParameters.get('includeInactive') === 'true';
    return respond(req, res, 200, includeInactive ? TEST_SERVICE_TEMPLATES : TEST_SERVICE_TEMPLATES.filter((template) => template.isActive));
  }

  if (/^\/companies\/[^/]+\/members$/.test(url) && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    return respond(req, res, 200, [TEST_MEMBER, TEST_ACCOUNTANT_MEMBER]);
  }

  if (/^\/companies\/[^/]+\/invites$/.test(url) && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    return respond(req, res, 200, [TEST_INVITE]);
  }

  if (/^\/companies\/[^/]+\/incoming$/.test(url) && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const searchParameters = new URLSearchParams(rawUrl.split('?')[1] ?? '');
    const requestedPage = Number(searchParameters.get('page'));
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const requestedLimit = Number(searchParameters.get('limit'));
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : 20;
    const status = searchParameters.get('status');
    const filteredInvoices = Array.from(incomingInvoices.values())
      .filter((invoice) => !status || invoice.status === status)
      .sort((firstInvoice, secondInvoice) => String(secondInvoice.issueDate ?? secondInvoice.createdAt).localeCompare(String(firstInvoice.issueDate ?? firstInvoice.createdAt)));
    const startIndex = (page - 1) * limit;
    return respond(req, res, 200, {
      data: filteredInvoices.slice(startIndex, startIndex + limit).map((invoice) => ({
        id: invoice.id,
        companyId: invoice.companyId,
        environment: invoice.environment,
        contractorId: invoice.contractorId,
        status: invoice.status,
        sellerName: invoice.sellerName,
        sellerNip: invoice.sellerNip,
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate,
        totalGross: invoice.totalGross,
        currency: invoice.currency,
        ocrError: invoice.ocrError,
        ksefReference: invoice.ksefReference,
        ksefEnvironment: invoice.ksefEnvironment,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
        contractor: invoice.contractor,
      })),
      total: filteredInvoices.length,
      page,
      limit,
    });
  }

  const incomingDetailMatch = url.match(/^\/companies\/([^/]+)\/incoming\/([^/]+)$/);
  if (incomingDetailMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, companyId, incomingInvoiceId] = incomingDetailMatch;
    if (companyId !== TEST_COMPANY.id) return respond(req, res, 404, { error: 'Not found' });
    const incomingInvoice = incomingInvoices.get(incomingInvoiceId);
    return incomingInvoice ? respond(req, res, 200, incomingInvoice) : respond(req, res, 404, { error: 'Not found' });
  }

  const incomingOcrStatusMatch = url.match(/^\/companies\/([^/]+)\/incoming\/([^/]+)\/ocr-status$/);
  if (incomingOcrStatusMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, companyId, incomingInvoiceId] = incomingOcrStatusMatch;
    const incomingInvoice = companyId === TEST_COMPANY.id ? incomingInvoices.get(incomingInvoiceId) : undefined;
    if (!incomingInvoice) return respond(req, res, 404, { error: 'Not found' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': req.headers['origin'] ?? '*',
      'Access-Control-Allow-Credentials': 'true',
    });
    res.write(`data: ${JSON.stringify({ status: incomingInvoice.status, ocrError: incomingInvoice.ocrError, ocrModel: incomingInvoice.ocrModel })}\n\n`);
    res.end();
    return;
  }

  const incomingConfirmMatch = url.match(/^\/companies\/([^/]+)\/incoming\/([^/]+)\/confirm$/);
  if (incomingConfirmMatch && method === 'POST') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, companyId, incomingInvoiceId] = incomingConfirmMatch;
    if (companyId !== TEST_COMPANY.id) return respond(req, res, 404, { error: 'Not found' });
    const incomingInvoice = incomingInvoices.get(incomingInvoiceId);
    if (!incomingInvoice) return respond(req, res, 404, { error: 'Not found' });
    return readJsonBody(req)
      .then((body) => {
        const updatedIncomingInvoice = {
          ...incomingInvoice,
          status: 'CONFIRMED',
          invoiceNumber: typeof body.invoiceNumber === 'string' ? body.invoiceNumber : incomingInvoice.invoiceNumber,
          issueDate: typeof body.issueDate === 'string' ? body.issueDate : incomingInvoice.issueDate,
          totalNet: typeof body.totalNet === 'string' ? body.totalNet : incomingInvoice.totalNet,
          totalVat: typeof body.totalVat === 'string' ? body.totalVat : incomingInvoice.totalVat,
          totalGross: typeof body.totalGross === 'string' ? body.totalGross : incomingInvoice.totalGross,
          currency: typeof body.currency === 'string' ? body.currency : incomingInvoice.currency,
          notes: typeof body.notes === 'string' ? body.notes : incomingInvoice.notes,
          confirmedAt: DEMO_NOW.toISOString(),
          updatedAt: DEMO_NOW.toISOString(),
        };
        incomingInvoices.set(incomingInvoiceId, updatedIncomingInvoice);
        return respond(req, res, 200, updatedIncomingInvoice);
      })
      .catch(() => respond(req, res, 400, { error: 'Invalid JSON body' }));
  }

  const incomingRejectMatch = url.match(/^\/companies\/([^/]+)\/incoming\/([^/]+)\/reject$/);
  if (incomingRejectMatch && method === 'POST') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, companyId, incomingInvoiceId] = incomingRejectMatch;
    if (companyId !== TEST_COMPANY.id) return respond(req, res, 404, { error: 'Not found' });
    const incomingInvoice = incomingInvoices.get(incomingInvoiceId);
    if (!incomingInvoice) return respond(req, res, 404, { error: 'Not found' });
    incomingInvoice.status = 'REJECTED';
    incomingInvoice.updatedAt = DEMO_NOW.toISOString();
    res.writeHead(204);
    res.end();
    return;
  }

  const incomingSyncMatch = url.match(/^\/companies\/([^/]+)\/incoming\/ksef-sync$/);
  if (incomingSyncMatch && method === 'POST') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, companyId] = incomingSyncMatch;
    if (companyId !== TEST_COMPANY.id) return respond(req, res, 404, { error: 'Not found' });
    return respond(req, res, 200, { syncId: 'test-sync-id', created: 1, linked: 2, skipped: 0 });
  }

  const companyBackupPolicyMatch = url.match(/^\/companies\/([^/]+)\/backup-policy$/);
  if (companyBackupPolicyMatch && (method === 'GET' || method === 'PATCH')) {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, companyId] = companyBackupPolicyMatch;
    if (companyId !== TEST_COMPANY.id) return respond(req, res, 404, { error: 'Not found' });
    if (method === 'GET') return respond(req, res, 200, TEST_BACKUP_SETTINGS);
    return readJsonBody(req)
      .then((body) => {
        Object.assign(TEST_BACKUP_SETTINGS.policy, body);
        TEST_BACKUP_SETTINGS.policy.updatedAt = DEMO_NOW.toISOString();
        return respond(req, res, 200, TEST_BACKUP_SETTINGS);
      })
      .catch(() => respond(req, res, 400, { error: 'Invalid JSON body' }));
  }

  const companyBackupStatusMatch = url.match(/^\/companies\/([^/]+)\/backup-status$/);
  if (companyBackupStatusMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, companyId] = companyBackupStatusMatch;
    if (companyId !== TEST_COMPANY.id) return respond(req, res, 404, { error: 'Not found' });
    return respond(req, res, 200, TEST_BACKUP_STATUS);
  }

  const companyBackupRunMatch = url.match(/^\/companies\/([^/]+)\/backup-policy\/run$/);
  if (companyBackupRunMatch && method === 'POST') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, companyId] = companyBackupRunMatch;
    if (companyId !== TEST_COMPANY.id) return respond(req, res, 404, { error: 'Not found' });
    const timestamp = DEMO_NOW.toISOString();
    return respond(req, res, 200, {
      backupRunId: 'test-backup-run-id',
      filesCount: 12,
      bytesTotal: 245760,
      startedAt: timestamp,
      finishedAt: timestamp,
      triggerSource: 'manual_admin',
    });
  }

  const fileMatch = url.match(/^\/files\/([^/]+)$/);
  if (fileMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, fileId] = fileMatch;
    if (fileId !== 'demo-incoming-scan-id') return respond(req, res, 404, { error: 'Not found' });
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': req.headers['origin'] ?? '*',
      'Access-Control-Allow-Credentials': 'true',
    });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px sans-serif;padding:48px;color:#1f2937}main{max-width:620px;margin:auto;border:2px solid #d1d5db;padding:32px}small{color:#6b7280}hr{border:0;border-top:1px solid #d1d5db}</style></head><body><main><h1>DEMO SOURCE DOCUMENT</h1><small>Synthetic OCR fixture — not a real invoice</small><hr><p><strong>Seller:</strong> Bluebird Example Studio LLC</p><p><strong>Invoice:</strong> INCOMING-DEMO-004</p><p><strong>Total:</strong> 369.00 PLN</p><p><strong>Status:</strong> Ready for review</p></main></body></html>`);
    return;
  }

  const complianceReportMatch = url.match(/^\/compliance\/([^/]+)\/reports\/([^/]+)$/);
  if (complianceReportMatch && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    const [, companyId, reportId] = complianceReportMatch;
    if (companyId !== TEST_COMPANY.id) return respond(req, res, 404, { error: 'Not found' });
    return respond(req, res, 200, {
      id: reportId === 'undefined' ? TEST_REPORT_ID : reportId,
      companyId,
      environment: 'TEST',
      createdAt: DEMO_NOW.toISOString(),
    });
  }

  if (url === '/backup/status' && method === 'GET') {
    if (!authToken) return respond(req, res, 401, { error: 'Unauthorized' });
    return respond(req, res, 200, {
      gdrive: {
        provider: 'google-drive',
        status: 'success',
        filesCount: 12,
        bytesTotal: '245760',
        errorMessage: null,
        startedAt: demoTimestamp(0, 30, 2),
        finishedAt: demoTimestamp(0, 30, 2),
      },
      icloud: null,
    });
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

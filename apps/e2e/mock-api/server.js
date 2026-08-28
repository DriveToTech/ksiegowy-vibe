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

function serializeHouseholdTransaction(transaction) {
  return {
    categoryId: null,
    payerUserId: null,
    bankDescription: null,
    tag: null,
    note: null,
    isRecurring: false,
    commitmentId: null,
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
    return respond(req, res, 200, { data: sorted.slice(0, limit), total: sorted.length, page: 1, limit });
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

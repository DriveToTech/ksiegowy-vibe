// @ts-check
'use strict';

const http = require('http');

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
    return respond(req, res, 200, {
      authenticated: true,
      user: TEST_USER,
      companies: isTestCompanyToken
        ? [{ id: TEST_COMPANY.id, role: 'ADMIN' }]
        : onboardingCompany
          ? [{ id: onboardingCompany.id, role: 'ADMIN' }]
          : [],
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

  respond(req, res, 404, { error: 'Not found' });
});

const PORT = process.env.MOCK_API_PORT ? parseInt(process.env.MOCK_API_PORT, 10) : 3099;

server.listen(PORT, () => {
  console.log(`Mock API listening on http://localhost:${PORT}`);
});

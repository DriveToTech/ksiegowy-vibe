// @ts-check
'use strict';

const http = require('http');

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

const TEST_SERVICE_TEMPLATE = {
  id: 'test-service-template-id',
  companyId: TEST_COMPANY.id,
  name: 'Accounting service',
  unit: 'hour',
  vatRate: '23',
  description: null,
  isActive: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

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
    return respond(req, res, 200, [TEST_SERVICE_TEMPLATE]);
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

  respond(req, res, 404, { error: 'Not found' });
});

const PORT = process.env.MOCK_API_PORT ? parseInt(process.env.MOCK_API_PORT, 10) : 3099;

server.listen(PORT, () => {
  console.log(`Mock API listening on http://localhost:${PORT}`);
});

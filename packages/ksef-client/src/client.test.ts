import assert from 'node:assert/strict';
import test from 'node:test';

import { KSEF_BASE_URLS, createKsefClient } from './client.js';
import { KsefClientError } from './types.js';

interface FetchCall {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

const createJsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const createFetchMock = (
  handler: (url: string, init: RequestInit | undefined, callIndex: number) => Promise<Response> | Response
): { readonly fetch: typeof fetch; readonly calls: FetchCall[] } => {
  const calls: FetchCall[] = [];
  const fetchImplementation: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return await handler(url, init, calls.length - 1);
  };
  return { fetch: fetchImplementation, calls };
};

// Minimal fake DER-encoded X.509 certificate — not cryptographically valid,
// but sufficient for tests that do not exercise actual RSA encryption.
// Real RSA encryption tests require a valid certificate from the KSeF environment.
const FAKE_CERT_BASE64 = Buffer.alloc(100).toString('base64');


test('KSEF_BASE_URLS contains correct v2 endpoints', () => {
  assert.deepEqual(KSEF_BASE_URLS, {
    test: 'https://api-test.ksef.mf.gov.pl/api/v2',
    production: 'https://api.ksef.mf.gov.pl/api/v2'
  });
});

test('getEnvironmentDetails returns correct baseUrl for test', () => {
  const client = createKsefClient({ environment: 'test' });
  assert.deepEqual(client.getEnvironmentDetails(), {
    environment: 'test',
    baseUrl: 'https://api-test.ksef.mf.gov.pl/api/v2'
  });
});

test('getEnvironmentDetails returns correct baseUrl for production', () => {
  const client = createKsefClient({ environment: 'production' });
  assert.deepEqual(client.getEnvironmentDetails(), {
    environment: 'production',
    baseUrl: 'https://api.ksef.mf.gov.pl/api/v2'
  });
});

test('refreshAuthSession throws KsefClientError on 401', async () => {
  const client = createKsefClient({
    environment: 'test',
    fetchImplementation: async () =>
      new Response('Unauthorized', { status: 401 })
  });

  await assert.rejects(client.refreshAuthSession('expired-refresh-token'), (error: unknown) => {
    assert.ok(error instanceof KsefClientError);
    assert.equal(error.code, 'KSEF_AUTH_REFRESH_HTTP_ERROR');
    assert.equal(error.statusCode, 401);
    assert.equal(error.environment, 'test');
    return true;
  });
});

test('refreshAuthSession throws KsefClientError on network failure', async () => {
  const client = createKsefClient({
    environment: 'test',
    fetchImplementation: async () => {
      throw new TypeError('fetch failed');
    }
  });

  await assert.rejects(client.refreshAuthSession('token'), (error: unknown) => {
    assert.ok(error instanceof KsefClientError);
    assert.equal(error.code, 'KSEF_AUTH_REFRESH_NETWORK_ERROR');
    assert.match(error.message, /failed before receiving a response/);
    return true;
  });
});

test('refreshAuthSession throws on missing accessToken in response', async () => {
  const client = createKsefClient({
    environment: 'test',
    fetchImplementation: async () => createJsonResponse({ unexpected: 'field' })
  });

  await assert.rejects(client.refreshAuthSession('token'), (error: unknown) => {
    assert.ok(error instanceof KsefClientError);
    assert.equal(error.code, 'KSEF_AUTH_REFRESH_INVALID_RESPONSE');
    return true;
  });
});

test('refreshAuthSession returns access token on success', async () => {
  const fetchMock = createFetchMock((url, init) => {
    assert.equal(url, 'https://api-test.ksef.mf.gov.pl/api/v2/auth/token/refresh');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer my-refresh-token');

    return createJsonResponse({
      accessToken: { token: 'new-access-token-123', validUntil: '2026-04-04T20:00:00Z' }
    });
  });

  const client = createKsefClient({
    environment: 'test',
    fetchImplementation: fetchMock.fetch
  });

  const accessToken = await client.refreshAuthSession('my-refresh-token');
  assert.equal(accessToken, 'new-access-token-123');
  assert.equal(fetchMock.calls.length, 1);
});

test('pollInvoiceStatus returns status on success', async () => {
  const fetchMock = createFetchMock((url, init) => {
    assert.equal(
      url,
      'https://api-test.ksef.mf.gov.pl/api/v2/sessions/SESSION-REF-001/invoices/INVOICE-REF-001'
    );
    assert.equal(init?.method, 'GET');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer access-token');

    return createJsonResponse({
      status: { code: 200, description: 'Accepted' },
      ksefReferenceNumber: 'KSEF-ACCEPTED-REF-001'
    });
  });

  const client = createKsefClient({
    environment: 'test',
    fetchImplementation: fetchMock.fetch
  });

  const result = await client.pollInvoiceStatus({
    accessToken: 'access-token',
    sessionRef: 'SESSION-REF-001',
    invoiceRef: 'INVOICE-REF-001'
  });

  assert.deepEqual(result, {
    sessionRef: 'SESSION-REF-001',
    invoiceRef: 'INVOICE-REF-001',
    statusCode: 200,
    ksefReferenceNumber: 'KSEF-ACCEPTED-REF-001',
    environment: 'test'
  });
});

test('pollInvoiceStatus returns pending when status code is 100', async () => {
  const client = createKsefClient({
    environment: 'test',
    fetchImplementation: async () =>
      createJsonResponse({ status: { code: 100, description: 'Processing' } })
  });

  const result = await client.pollInvoiceStatus({
    accessToken: 'token',
    sessionRef: 'SESSION-REF',
    invoiceRef: 'INVOICE-REF'
  });

  assert.equal(result.statusCode, 100);
  assert.equal(result.ksefReferenceNumber, undefined);
});

test('pollInvoiceStatus throws KsefClientError on http error', async () => {
  const client = createKsefClient({
    environment: 'test',
    fetchImplementation: async () =>
      new Response('Session not found', { status: 404 })
  });

  await assert.rejects(
    client.pollInvoiceStatus({ accessToken: 'token', sessionRef: 'BAD-REF', invoiceRef: 'BAD-REF' }),
    (error: unknown) => {
      assert.ok(error instanceof KsefClientError);
      assert.equal(error.code, 'KSEF_POLL_HTTP_ERROR');
      assert.equal(error.statusCode, 404);
      return true;
    }
  );
});

test('pollInvoiceStatus throws on missing status field in response', async () => {
  const client = createKsefClient({
    environment: 'test',
    fetchImplementation: async () => createJsonResponse({ referenceNumber: 'REF' })
  });

  await assert.rejects(
    client.pollInvoiceStatus({ accessToken: 'token', sessionRef: 'S', invoiceRef: 'I' }),
    (error: unknown) => {
      assert.ok(error instanceof KsefClientError);
      assert.equal(error.code, 'KSEF_POLL_INVALID_RESPONSE');
      return true;
    }
  );
});

test('public keys fetch failure throws KsefClientError', async () => {
  const client = createKsefClient({
    environment: 'test',
    fetchImplementation: async () => new Response('Service unavailable', { status: 503 })
  });

  // initAuthSession fetches public keys first — a 503 there should propagate
  await assert.rejects(
    client.initAuthSession({ ksefToken: 'token', nip: '1234567890' }),
    (error: unknown) => {
      assert.ok(error instanceof KsefClientError);
      assert.equal(error.code, 'KSEF_PUBLIC_KEYS_HTTP_ERROR');
      assert.equal(error.statusCode, 503);
      return true;
    }
  );
});

test('initAuthSession fails when KsefTokenEncryption cert is missing', async () => {
  const keysWithoutTokenEnc = [
    { certificate: FAKE_CERT_BASE64, validFrom: '2025-01-01T00:00:00Z', validTo: '2027-01-01T00:00:00Z', usage: ['SymmetricKeyEncryption'] }
  ];

  const client = createKsefClient({
    environment: 'test',
    fetchImplementation: async () => createJsonResponse(keysWithoutTokenEnc)
  });

  await assert.rejects(
    client.initAuthSession({ ksefToken: 'token', nip: '1234567890' }),
    (error: unknown) => {
      assert.ok(error instanceof KsefClientError);
      assert.equal(error.code, 'KSEF_PUBLIC_KEYS_MISSING');
      return true;
    }
  );
});

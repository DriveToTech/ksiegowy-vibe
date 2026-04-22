import crypto from 'node:crypto';

import {
  encryptKsefToken,
  generateAesSessionKey,
  encryptAesKey,
  encryptInvoiceXml
} from './auth.js';

import type {
  KsefAuthRedeemResponse,
  KsefAuthRefreshResponse,
  KsefAuthStatusResponse,
  KsefAuthTokenResponse,
  KsefChallengeResponse,
  KsefEnvironment,
  KsefEnvironmentDetails,
  KsefIncomingInvoiceHeader,
  KsefInvoiceQueryResult,
  KsefInvoiceStatusResult,
  KsefOpenSessionResponse,
  KsefPublicKeyCertificate,
  KsefQueryIncomingInvoicesInput,
  KsefSendInvoiceResponse,
  KsefSessionInitResult,
  KsefSubmitResult
} from '@ksiegowy/types';

import type { KsefClient, KsefClientConfig, KsefTokenAuthInput } from './types.js';
import { KsefClientError } from './types.js';

const KSEF_BASE_URLS: Record<KsefEnvironment, string> = {
  test: 'https://api-test.ksef.mf.gov.pl/api/v2',
  production: 'https://api.ksef.mf.gov.pl/api/v2'
};

// Paths
const CHALLENGE_PATH = '/auth/challenge';
const KSEF_TOKEN_PATH = '/auth/ksef-token';
const AUTH_STATUS_PATH = '/auth'; // GET /auth/{referenceNumber}
const AUTH_REDEEM_PATH = '/auth/token/redeem';
const AUTH_REFRESH_PATH = '/auth/token/refresh';
const PUBLIC_KEYS_PATH = '/security/public-key-certificates';
const SESSIONS_ONLINE_PATH = '/sessions/online';
const SESSIONS_PATH = '/sessions'; // Used for status queries after session close
const QUERY_INVOICE_METADATA_PATH = '/invoices/query/metadata';
const INVOICES_KSEF_PATH = '/invoices/ksef';

// FA(3) form code values for the session open request
const FA3_FORM_CODE = {
  systemCode: 'FA (3)',
  schemaVersion: '1-0E',
  value: 'FA'
};

const AUTH_POLL_INTERVAL_MS = 2000;
const AUTH_POLL_TIMEOUT_MS = 60000;

const getEnvironmentDetails = (environment: KsefEnvironment): KsefEnvironmentDetails => ({
  environment,
  baseUrl: KSEF_BASE_URLS[environment]
});

const buildUrl = (environment: KsefEnvironment, path: string): string =>
  `${KSEF_BASE_URLS[environment]}${path}`;

const buildErrorMessage = (input: {
  readonly summary: string;
  readonly environment: KsefEnvironment;
  readonly endpointUrl?: string;
  readonly statusCode?: number;
  readonly details?: string;
}): string => {
  const parts = [input.summary, `environment=${input.environment}`];
  if (input.endpointUrl !== undefined) parts.push(`endpoint=${input.endpointUrl}`);
  if (input.statusCode !== undefined) parts.push(`status=${input.statusCode}`);
  if (input.details !== undefined && input.details.length > 0) parts.push(`details=${input.details}`);
  return parts.join('; ');
};

const getResponseText = async (response: Response): Promise<string> => {
  try {
    return await response.text();
  } catch {
    return '';
  }
};

const performJsonRequest = async (input: {
  readonly fetchImplementation: typeof fetch;
  readonly environment: KsefEnvironment;
  readonly endpointUrl: string;
  readonly method: 'GET' | 'POST' | 'DELETE';
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly networkErrorCode: string;
  readonly networkErrorSummary: string;
  readonly networkErrorDetails: string;
  readonly httpErrorCode: string;
  readonly httpErrorSummary: string;
  readonly httpErrorFallbackDetails: string;
  readonly invalidJsonCode: string;
  readonly invalidJsonSummary: string;
}): Promise<unknown> => {
  let response: Response;

  try {
    const requestInit: RequestInit = {
      method: input.method,
      headers: {
        'Content-Type': 'application/json',
        'X-KSeF-APIVersion': '2.0',
        ...input.headers
      }
    };

    if (input.body !== undefined) {
      requestInit.body = JSON.stringify(input.body);
    }

    response = await input.fetchImplementation(input.endpointUrl, requestInit);
  } catch (error) {
    throw new KsefClientError({
      code: input.networkErrorCode,
      cause: error,
      environment: input.environment,
      endpointUrl: input.endpointUrl,
      message: buildErrorMessage({
        summary: input.networkErrorSummary,
        environment: input.environment,
        endpointUrl: input.endpointUrl,
        details: input.networkErrorDetails
      })
    });
  }

  if (!response.ok) {
    const responseText = await getResponseText(response);
    throw new KsefClientError({
      code: input.httpErrorCode,
      environment: input.environment,
      endpointUrl: input.endpointUrl,
      statusCode: response.status,
      details: responseText,
      message: buildErrorMessage({
        summary: input.httpErrorSummary,
        environment: input.environment,
        endpointUrl: input.endpointUrl,
        statusCode: response.status,
        details: responseText || input.httpErrorFallbackDetails
      })
    });
  }

  // 204 No Content — return undefined
  if (response.status === 204) return undefined;

  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new KsefClientError({
      code: input.invalidJsonCode,
      cause: error,
      environment: input.environment,
      endpointUrl: input.endpointUrl,
      message: buildErrorMessage({
        summary: input.invalidJsonSummary,
        environment: input.environment,
        endpointUrl: input.endpointUrl
      })
    });
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const extractString = (obj: unknown, field: string, context: string): string => {
  if (!isRecord(obj) || typeof obj[field] !== 'string' || (obj[field] as string).length === 0) {
    throw new Error(`${context}: missing or empty field '${field}'`);
  }
  return obj[field] as string;
};

const extractNumber = (obj: unknown, field: string, context: string): number => {
  if (!isRecord(obj) || typeof obj[field] !== 'number') {
    throw new Error(`${context}: missing or non-numeric field '${field}'`);
  }
  return obj[field] as number;
};

/**
 * Fetches KSeF public key certificates. Returns two certs:
 * - KsefTokenEncryption: for encrypting the API token during auth
 * - SymmetricKeyEncryption: for encrypting the AES session key
 */
const fetchPublicKeys = async (
  fetchImplementation: typeof fetch,
  environment: KsefEnvironment
): Promise<{ tokenEncCert: string; symmetricKeyEncCert: string }> => {
  const endpointUrl = buildUrl(environment, PUBLIC_KEYS_PATH);

  const data = await performJsonRequest({
    fetchImplementation,
    environment,
    endpointUrl,
    method: 'GET',
    networkErrorCode: 'KSEF_PUBLIC_KEYS_NETWORK_ERROR',
    networkErrorSummary: 'KSeF public key fetch failed before receiving a response',
    networkErrorDetails: 'Check network connectivity and whether the KSeF environment is reachable.',
    httpErrorCode: 'KSEF_PUBLIC_KEYS_HTTP_ERROR',
    httpErrorSummary: 'KSeF public key fetch was rejected',
    httpErrorFallbackDetails: 'Verify the selected KSeF environment.',
    invalidJsonCode: 'KSEF_PUBLIC_KEYS_INVALID_JSON',
    invalidJsonSummary: 'KSeF public key response was not valid JSON'
  });

  if (!Array.isArray(data)) {
    throw new KsefClientError({
      code: 'KSEF_PUBLIC_KEYS_INVALID_RESPONSE',
      environment,
      endpointUrl,
      message: buildErrorMessage({
        summary: 'KSeF public key response is not an array',
        environment,
        endpointUrl
      })
    });
  }

  const certs = data as KsefPublicKeyCertificate[];
  const tokenEncCert = certs.find((c) => c.usage.includes('KsefTokenEncryption'));
  const symmetricKeyEncCert = certs.find((c) => c.usage.includes('SymmetricKeyEncryption'));

  if (!tokenEncCert || !symmetricKeyEncCert) {
    throw new KsefClientError({
      code: 'KSEF_PUBLIC_KEYS_MISSING',
      environment,
      endpointUrl,
      message: buildErrorMessage({
        summary: 'KSeF public key response is missing required certificates',
        environment,
        endpointUrl,
        details: `found=${certs.map((c) => c.usage.join(',')).join('; ')}`
      })
    });
  }

  return {
    tokenEncCert: tokenEncCert.certificate,
    symmetricKeyEncCert: symmetricKeyEncCert.certificate
  };
};

/**
 * Polls GET /auth/{referenceNumber} until status.code === 200 or timeout.
 */
const pollAuthStatus = async (
  fetchImplementation: typeof fetch,
  environment: KsefEnvironment,
  referenceNumber: string,
  authenticationToken: string
): Promise<void> => {
  const endpointUrl = buildUrl(environment, `${AUTH_STATUS_PATH}/${encodeURIComponent(referenceNumber)}`);
  const deadline = Date.now() + AUTH_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const data = await performJsonRequest({
      fetchImplementation,
      environment,
      endpointUrl,
      method: 'GET',
      headers: { Authorization: `Bearer ${authenticationToken}` },
      networkErrorCode: 'KSEF_AUTH_POLL_NETWORK_ERROR',
      networkErrorSummary: 'KSeF auth status poll failed before receiving a response',
      networkErrorDetails: 'Check network connectivity and whether the KSeF environment is reachable.',
      httpErrorCode: 'KSEF_AUTH_POLL_HTTP_ERROR',
      httpErrorSummary: 'KSeF auth status poll was rejected',
      httpErrorFallbackDetails: 'Verify the authentication token and reference number.',
      invalidJsonCode: 'KSEF_AUTH_POLL_INVALID_JSON',
      invalidJsonSummary: 'KSeF auth status poll response was not valid JSON'
    }) as KsefAuthStatusResponse;

    if (isRecord(data)) {
      // KSeF v2 returns processingCode at the top level; older responses may nest it under status.code
      const processingCode = typeof data.processingCode === 'number' ? data.processingCode : undefined;
      const nestedCode = isRecord(data.status) && typeof data.status.code === 'number' ? data.status.code : undefined;
      const code = processingCode ?? nestedCode;

      if (code === 200) return;
      if (code === 400) {
        const description = isRecord(data.status) && typeof data.status.description === 'string'
          ? data.status.description
          : (typeof data.processingDescription === 'string' ? data.processingDescription : '');
        throw new KsefClientError({
          code: 'KSEF_AUTH_FAILED',
          environment,
          endpointUrl,
          message: buildErrorMessage({
            summary: 'KSeF authentication failed',
            environment,
            endpointUrl,
            details: description
          })
        });
      }
    }

    await new Promise((resolve) => setTimeout(resolve, AUTH_POLL_INTERVAL_MS));
  }

  throw new KsefClientError({
    code: 'KSEF_AUTH_POLL_TIMEOUT',
    environment,
    endpointUrl,
    message: buildErrorMessage({
      summary: 'KSeF authentication polling timed out',
      environment,
      endpointUrl,
      details: `timeout=${AUTH_POLL_TIMEOUT_MS}ms`
    })
  });
};

export const createKsefClient = (config: KsefClientConfig): KsefClient => {
  const fetchImplementation = config.fetchImplementation ?? fetch;

  // Cached public keys — fetched once per client instance
  let cachedPublicKeys: { tokenEncCert: string; symmetricKeyEncCert: string } | null = null;

  const getPublicKeys = async () => {
    if (!cachedPublicKeys) {
      cachedPublicKeys = await fetchPublicKeys(fetchImplementation, config.environment);
    }
    return cachedPublicKeys;
  };

  return {
    getEnvironmentDetails(): KsefEnvironmentDetails {
      return getEnvironmentDetails(config.environment);
    },

    /**
     * Full KSeF token authentication flow (Path B):
     * challenge → encrypt token → POST /auth/ksef-token → poll → redeem → return tokens
     */
    async initAuthSession(input: KsefTokenAuthInput): Promise<KsefSessionInitResult> {
      const publicKeys = await getPublicKeys();

      // Step 1: Get challenge
      const challengeUrl = buildUrl(config.environment, CHALLENGE_PATH);
      const challengeData = await performJsonRequest({
        fetchImplementation,
        environment: config.environment,
        endpointUrl: challengeUrl,
        method: 'POST',
        body: { contextIdentifier: { type: 'nip', value: input.nip } },
        networkErrorCode: 'KSEF_CHALLENGE_NETWORK_ERROR',
        networkErrorSummary: 'KSeF challenge request failed before receiving a response',
        networkErrorDetails: 'Check network connectivity and whether the KSeF environment is reachable.',
        httpErrorCode: 'KSEF_CHALLENGE_HTTP_ERROR',
        httpErrorSummary: 'KSeF challenge request was rejected',
        httpErrorFallbackDetails: 'Verify the NIP and selected environment.',
        invalidJsonCode: 'KSEF_CHALLENGE_INVALID_JSON',
        invalidJsonSummary: 'KSeF challenge response was not valid JSON'
      }) as KsefChallengeResponse;

      const challenge = extractString(challengeData, 'challenge', 'challenge response');
      const timestampMs = extractNumber(challengeData, 'timestampMs', 'challenge response');

      // Step 2: Encrypt token (raw token + timestamp, per KSeF v2 spec)
      const encryptedToken = encryptKsefToken(input.ksefToken, timestampMs, publicKeys.tokenEncCert);

      // Step 3: POST /auth/ksef-token
      const ksefTokenUrl = buildUrl(config.environment, KSEF_TOKEN_PATH);
      const authTokenData = await performJsonRequest({
        fetchImplementation,
        environment: config.environment,
        endpointUrl: ksefTokenUrl,
        method: 'POST',
        body: {
          challenge,
          contextIdentifier: { type: 'nip', value: input.nip },
          encryptedToken
        },
        networkErrorCode: 'KSEF_AUTH_TOKEN_NETWORK_ERROR',
        networkErrorSummary: 'KSeF auth token request failed before receiving a response',
        networkErrorDetails: 'Check network connectivity and whether the KSeF environment is reachable.',
        httpErrorCode: 'KSEF_AUTH_TOKEN_HTTP_ERROR',
        httpErrorSummary: 'KSeF auth token request was rejected',
        httpErrorFallbackDetails: 'Verify the KSeF API token, NIP, and selected environment.',
        invalidJsonCode: 'KSEF_AUTH_TOKEN_INVALID_JSON',
        invalidJsonSummary: 'KSeF auth token response was not valid JSON'
      }) as KsefAuthTokenResponse;

      const referenceNumber = extractString(authTokenData, 'referenceNumber', 'auth token response');
      const authTokenObj = isRecord(authTokenData) ? authTokenData.authenticationToken : undefined;
      const authenticationToken = extractString(authTokenObj, 'token', 'auth token response authenticationToken');

      // Step 4: Poll until auth is ready
      await pollAuthStatus(fetchImplementation, config.environment, referenceNumber, authenticationToken);

      // Step 5: Redeem tokens
      const redeemUrl = buildUrl(config.environment, AUTH_REDEEM_PATH);
      const redeemData = await performJsonRequest({
        fetchImplementation,
        environment: config.environment,
        endpointUrl: redeemUrl,
        method: 'POST',
        headers: { Authorization: `Bearer ${authenticationToken}` },
        networkErrorCode: 'KSEF_AUTH_REDEEM_NETWORK_ERROR',
        networkErrorSummary: 'KSeF auth redeem request failed before receiving a response',
        networkErrorDetails: 'Check network connectivity.',
        httpErrorCode: 'KSEF_AUTH_REDEEM_HTTP_ERROR',
        httpErrorSummary: 'KSeF auth redeem request was rejected',
        httpErrorFallbackDetails: 'The authentication token may have expired. Retry the full auth flow.',
        invalidJsonCode: 'KSEF_AUTH_REDEEM_INVALID_JSON',
        invalidJsonSummary: 'KSeF auth redeem response was not valid JSON'
      }) as KsefAuthRedeemResponse;

      if (!isRecord(redeemData) || !isRecord(redeemData.accessToken) || !isRecord(redeemData.refreshToken)) {
        throw new KsefClientError({
          code: 'KSEF_AUTH_REDEEM_INVALID_RESPONSE',
          environment: config.environment,
          endpointUrl: redeemUrl,
          message: buildErrorMessage({
            summary: 'KSeF auth redeem response is missing accessToken or refreshToken',
            environment: config.environment,
            endpointUrl: redeemUrl
          })
        });
      }

      const accessToken = extractString(redeemData.accessToken, 'token', 'auth redeem accessToken');
      const refreshToken = extractString(redeemData.refreshToken, 'token', 'auth redeem refreshToken');
      const refreshTokenValidUntil = extractString(redeemData.refreshToken, 'validUntil', 'auth redeem refreshToken');

      return { accessToken, refreshToken, refreshTokenValidUntil };
    },

    /**
     * Refresh auth session using a stored refresh token.
     * Returns a new accessToken.
     */
    async refreshAuthSession(refreshToken: string): Promise<string> {
      const refreshUrl = buildUrl(config.environment, AUTH_REFRESH_PATH);

      const data = await performJsonRequest({
        fetchImplementation,
        environment: config.environment,
        endpointUrl: refreshUrl,
        method: 'POST',
        headers: { Authorization: `Bearer ${refreshToken}` },
        networkErrorCode: 'KSEF_AUTH_REFRESH_NETWORK_ERROR',
        networkErrorSummary: 'KSeF auth refresh request failed before receiving a response',
        networkErrorDetails: 'Check network connectivity.',
        httpErrorCode: 'KSEF_AUTH_REFRESH_HTTP_ERROR',
        httpErrorSummary: 'KSeF auth refresh request was rejected',
        httpErrorFallbackDetails: 'The refresh token may have expired. Re-authenticate with the full auth flow.',
        invalidJsonCode: 'KSEF_AUTH_REFRESH_INVALID_JSON',
        invalidJsonSummary: 'KSeF auth refresh response was not valid JSON'
      }) as KsefAuthRefreshResponse;

      if (!isRecord(data) || !isRecord(data.accessToken)) {
        throw new KsefClientError({
          code: 'KSEF_AUTH_REFRESH_INVALID_RESPONSE',
          environment: config.environment,
          endpointUrl: refreshUrl,
          message: buildErrorMessage({
            summary: 'KSeF auth refresh response is missing accessToken',
            environment: config.environment,
            endpointUrl: refreshUrl
          })
        });
      }

      return extractString(data.accessToken, 'token', 'auth refresh accessToken');
    },

    /**
     * Submits an invoice through a KSeF online session:
     * openSession → encrypt XML → sendInvoice → closeSession
     *
     * Returns sessionRef and invoiceRef for later status polling.
     */
    async submitInvoice(input: { accessToken: string; xml: string }): Promise<KsefSubmitResult> {
      const publicKeys = await getPublicKeys();

      // Generate AES key for this session
      const { key: aesKey, iv } = generateAesSessionKey();
      const encryptedSymmetricKey = encryptAesKey(aesKey, publicKeys.symmetricKeyEncCert);
      const initializationVector = iv.toString('base64');

      // Open session
      const openSessionUrl = buildUrl(config.environment, SESSIONS_ONLINE_PATH);
      const openSessionData = await performJsonRequest({
        fetchImplementation,
        environment: config.environment,
        endpointUrl: openSessionUrl,
        method: 'POST',
        headers: { Authorization: `Bearer ${input.accessToken}` },
        body: {
          formCode: FA3_FORM_CODE,
          encryption: { encryptedSymmetricKey, initializationVector }
        },
        networkErrorCode: 'KSEF_OPEN_SESSION_NETWORK_ERROR',
        networkErrorSummary: 'KSeF open session request failed before receiving a response',
        networkErrorDetails: 'Check network connectivity and whether the KSeF environment is reachable.',
        httpErrorCode: 'KSEF_OPEN_SESSION_HTTP_ERROR',
        httpErrorSummary: 'KSeF open session request was rejected',
        httpErrorFallbackDetails: 'Verify the access token and selected environment.',
        invalidJsonCode: 'KSEF_OPEN_SESSION_INVALID_JSON',
        invalidJsonSummary: 'KSeF open session response was not valid JSON'
      }) as KsefOpenSessionResponse;

      const sessionRef = extractString(openSessionData, 'referenceNumber', 'open session response');

      // Encrypt invoice XML
      const xmlBuffer = Buffer.from(input.xml, 'utf8');
      const encryptedBytes = encryptInvoiceXml(input.xml, aesKey, iv);

      const invoiceHash = crypto.createHash('sha256').update(xmlBuffer).digest('base64');
      const encryptedInvoiceHash = crypto.createHash('sha256').update(encryptedBytes).digest('base64');

      // Send invoice
      const sendInvoiceUrl = buildUrl(
        config.environment,
        `${SESSIONS_ONLINE_PATH}/${encodeURIComponent(sessionRef)}/invoices`
      );

      const sendData = await performJsonRequest({
        fetchImplementation,
        environment: config.environment,
        endpointUrl: sendInvoiceUrl,
        method: 'POST',
        headers: { Authorization: `Bearer ${input.accessToken}` },
        body: {
          invoiceHash,
          invoiceSize: xmlBuffer.byteLength,
          encryptedInvoiceHash,
          encryptedInvoiceSize: encryptedBytes.byteLength,
          encryptedInvoiceContent: encryptedBytes.toString('base64')
        },
        networkErrorCode: 'KSEF_SEND_INVOICE_NETWORK_ERROR',
        networkErrorSummary: 'KSeF send invoice request failed before receiving a response',
        networkErrorDetails: 'Check network connectivity, TLS trust, and whether the KSeF environment is reachable.',
        httpErrorCode: 'KSEF_SEND_INVOICE_HTTP_ERROR',
        httpErrorSummary: 'KSeF send invoice request was rejected',
        httpErrorFallbackDetails: 'Verify the access token, session reference, and invoice XML validity.',
        invalidJsonCode: 'KSEF_SEND_INVOICE_INVALID_JSON',
        invalidJsonSummary: 'KSeF send invoice response was not valid JSON'
      }) as KsefSendInvoiceResponse;

      const invoiceRef = extractString(sendData, 'referenceNumber', 'send invoice response');

      // Close session — this triggers KSeF's async invoice processing.
      // Status must be polled AFTER close via GET /sessions/{ref}/invoices/{ref},
      // NOT via the /sessions/online/ path (which is only valid while open).
      const closeSessionUrl = buildUrl(
        config.environment,
        `${SESSIONS_ONLINE_PATH}/${encodeURIComponent(sessionRef)}/close`
      );

      await performJsonRequest({
        fetchImplementation,
        environment: config.environment,
        endpointUrl: closeSessionUrl,
        method: 'POST',
        headers: { Authorization: `Bearer ${input.accessToken}` },
        networkErrorCode: 'KSEF_CLOSE_SESSION_NETWORK_ERROR',
        networkErrorSummary: 'KSeF close session request failed before receiving a response',
        networkErrorDetails: 'Check network connectivity.',
        httpErrorCode: 'KSEF_CLOSE_SESSION_HTTP_ERROR',
        httpErrorSummary: 'KSeF close session request was rejected',
        httpErrorFallbackDetails: 'The session may have already been closed.',
        invalidJsonCode: 'KSEF_CLOSE_SESSION_INVALID_JSON',
        invalidJsonSummary: 'KSeF close session response was not valid JSON'
      }).catch(() => {
        // Close failure is non-fatal; invoice was already submitted
      });

      // Poll for acceptance using the post-close endpoint GET /sessions/{ref}/invoices/{ref}.
      // KSeF processes invoices asynchronously after session close, typically within seconds.
      const SUBMIT_POLL_ATTEMPTS = 5;
      const SUBMIT_POLL_DELAY_MS = 3000;
      let ksefReferenceNumber: string | undefined;
      const pollUrl = buildUrl(
        config.environment,
        `${SESSIONS_PATH}/${encodeURIComponent(sessionRef)}/invoices/${encodeURIComponent(invoiceRef)}`
      );

      for (let attempt = 0; attempt < SUBMIT_POLL_ATTEMPTS; attempt++) {
        await new Promise<void>((resolve) => setTimeout(resolve, SUBMIT_POLL_DELAY_MS));

        const statusData = await performJsonRequest({
          fetchImplementation,
          environment: config.environment,
          endpointUrl: pollUrl,
          method: 'GET',
          headers: { Authorization: `Bearer ${input.accessToken}` },
          networkErrorCode: 'KSEF_POLL_NETWORK_ERROR',
          networkErrorSummary: 'KSeF invoice status poll failed before receiving a response',
          networkErrorDetails: 'Check network connectivity.',
          httpErrorCode: 'KSEF_POLL_HTTP_ERROR',
          httpErrorSummary: 'KSeF invoice status poll was rejected',
          httpErrorFallbackDetails: 'Verify the session reference and invoice reference.',
          invalidJsonCode: 'KSEF_POLL_INVALID_JSON',
          invalidJsonSummary: 'KSeF invoice status poll response was not valid JSON'
        }).catch(() => null);

        if (!isRecord(statusData) || !isRecord(statusData.status)) continue;

        const statusCode = typeof statusData.status.code === 'number' ? statusData.status.code : 0;

        // KSeF API v2 returns the number as "ksefNumber" on the /sessions/ endpoint
        const ksefNum = (statusData.ksefNumber ?? statusData.ksefReferenceNumber) as string | undefined;
        if (statusCode === 200 && typeof ksefNum === 'string' && ksefNum.length > 0) {
          ksefReferenceNumber = ksefNum;
          break;
        }

        if (statusCode === 400) break;
      }

      return { sessionRef, invoiceRef, ...(ksefReferenceNumber !== undefined ? { ksefReferenceNumber } : {}) };
    },

    /**
     * Polls the status of a submitted invoice.
     * Status codes: 100 = processing, 200 = accepted, 400 = rejected
     */
    async pollInvoiceStatus(input: {
      accessToken: string;
      sessionRef: string;
      invoiceRef: string;
    }): Promise<KsefInvoiceStatusResult> {
      // Use /sessions/ (not /sessions/online/) — this endpoint works after session close.
      const endpointUrl = buildUrl(
        config.environment,
        `${SESSIONS_PATH}/${encodeURIComponent(input.sessionRef)}/invoices/${encodeURIComponent(input.invoiceRef)}`
      );

      const data = await performJsonRequest({
        fetchImplementation,
        environment: config.environment,
        endpointUrl,
        method: 'GET',
        headers: { Authorization: `Bearer ${input.accessToken}` },
        networkErrorCode: 'KSEF_POLL_NETWORK_ERROR',
        networkErrorSummary: 'KSeF invoice status poll failed before receiving a response',
        networkErrorDetails: 'Check network connectivity and whether the KSeF environment is reachable.',
        httpErrorCode: 'KSEF_POLL_HTTP_ERROR',
        httpErrorSummary: 'KSeF invoice status poll was rejected',
        httpErrorFallbackDetails: 'Verify the access token, session reference, and invoice reference.',
        invalidJsonCode: 'KSEF_POLL_INVALID_JSON',
        invalidJsonSummary: 'KSeF invoice status poll response was not valid JSON'
      });

      if (!isRecord(data) || !isRecord(data.status)) {
        throw new KsefClientError({
          code: 'KSEF_POLL_INVALID_RESPONSE',
          environment: config.environment,
          endpointUrl,
          message: buildErrorMessage({
            summary: 'KSeF invoice status response is missing status field',
            environment: config.environment,
            endpointUrl
          })
        });
      }

      const statusCode = typeof data.status.code === 'number' ? data.status.code : 0;

      const base: KsefInvoiceStatusResult = {
        sessionRef: input.sessionRef,
        invoiceRef: input.invoiceRef,
        statusCode,
        environment: config.environment
      };

      // KSeF API v2 returns the number as "ksefNumber" on the /sessions/ endpoint.
      // Fall back to "ksefReferenceNumber" in case of API version differences.
      const ksefNum = (data.ksefNumber ?? data.ksefReferenceNumber) as string | undefined;
      if (typeof ksefNum === 'string' && ksefNum.length > 0) {
        return { ...base, ksefReferenceNumber: ksefNum };
      }

      return base;
    },

    /**
     * Queries KSeF for incoming invoices where the authenticated company is the buyer (subject2).
     * Uses POST /query/invoice/sync with pagination support.
     */
    async queryIncomingInvoices(input: KsefQueryIncomingInvoicesInput): Promise<KsefInvoiceQueryResult> {
      const pageOffset = input.pageOffset ?? 0;
      const pageSize = input.pageSize ?? 100;
      const endpointUrl = `${buildUrl(config.environment, QUERY_INVOICE_METADATA_PATH)}?pageOffset=${pageOffset}&pageSize=${pageSize}`;

      const data = await performJsonRequest({
        fetchImplementation,
        environment: config.environment,
        endpointUrl,
        method: 'POST',
        headers: { Authorization: `Bearer ${input.accessToken}` },
        body: {
          subjectType: 'Subject2',
          dateRange: {
            dateType: 'Issue',
            from: `${input.dateFrom}T00:00:00.000+00:00`,
            to: `${input.dateTo}T23:59:59.999+00:00`
          }
        },
        networkErrorCode: 'KSEF_QUERY_INCOMING_NETWORK_ERROR',
        networkErrorSummary: 'KSeF incoming invoice query failed before receiving a response',
        networkErrorDetails: 'Check network connectivity and whether the KSeF environment is reachable.',
        httpErrorCode: 'KSEF_QUERY_INCOMING_HTTP_ERROR',
        httpErrorSummary: 'KSeF incoming invoice query was rejected',
        httpErrorFallbackDetails: 'Verify the access token and date range.',
        invalidJsonCode: 'KSEF_QUERY_INCOMING_INVALID_JSON',
        invalidJsonSummary: 'KSeF incoming invoice query response was not valid JSON'
      });

      // v2 returns { invoices: [...], hasMore: bool } — invoices array may be named differently
      const invoiceArray = Array.isArray(data) ? data
        : isRecord(data) && Array.isArray(data.invoices) ? data.invoices
        : isRecord(data) && Array.isArray(data.invoiceHeaderList) ? data.invoiceHeaderList
        : null;

      if (!isRecord(data) || invoiceArray === null) {
        throw new KsefClientError({
          code: 'KSEF_QUERY_INCOMING_INVALID_RESPONSE',
          environment: config.environment,
          endpointUrl,
          message: buildErrorMessage({
            summary: 'KSeF incoming invoice query response is missing invoices array',
            environment: config.environment,
            endpointUrl,
            details: `received keys: ${isRecord(data) ? Object.keys(data).join(', ') : typeof data}`
          })
        });
      }

      const hasMore = isRecord(data) && data.hasMore === true;
      return {
        pageOffset,
        pageSize,
        numberOfElements: invoiceArray.length,
        hasMore,
        invoiceHeaderList: invoiceArray as KsefIncomingInvoiceHeader[]
      };
    },

    /**
     * Fetches the raw FA(3) XML of a specific invoice by its KSeF reference number.
     * Uses GET /invoices/{ksefReferenceNumber}.
     */
    async fetchInvoiceXml(input: { accessToken: string; ksefReferenceNumber: string }): Promise<string> {
      const endpointUrl = buildUrl(
        config.environment,
        `${INVOICES_KSEF_PATH}/${encodeURIComponent(input.ksefReferenceNumber)}`
      );

      let response: Response;

      try {
        response = await fetchImplementation(endpointUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            'Accept': 'application/octet-stream',
            'X-KSeF-APIVersion': '2.0'
          }
        });
      } catch (error) {
        throw new KsefClientError({
          code: 'KSEF_FETCH_XML_NETWORK_ERROR',
          cause: error,
          environment: config.environment,
          endpointUrl,
          message: buildErrorMessage({
            summary: 'KSeF invoice XML fetch failed before receiving a response',
            environment: config.environment,
            endpointUrl,
            details: 'Check network connectivity and whether the KSeF environment is reachable.'
          })
        });
      }

      if (!response.ok) {
        const responseText = await getResponseText(response);
        throw new KsefClientError({
          code: 'KSEF_FETCH_XML_HTTP_ERROR',
          environment: config.environment,
          endpointUrl,
          statusCode: response.status,
          details: responseText,
          message: buildErrorMessage({
            summary: 'KSeF invoice XML fetch was rejected',
            environment: config.environment,
            endpointUrl,
            statusCode: response.status,
            details: responseText || 'Verify the KSeF reference number and access token.'
          })
        });
      }

      return response.text();
    }
  };
};

export { KSEF_BASE_URLS };

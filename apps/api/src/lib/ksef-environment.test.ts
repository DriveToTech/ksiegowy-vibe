import type { PrismaClient } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  KSEF_ENVIRONMENT_HEADER,
  requireExplicitKsefEnvironment,
  readRequestedKsefEnvironment,
  resolveEffectiveKsefEnvironment,
} from './ksef-environment.js';

const mockBadRequest = (message: string) => new Error(message);
const mockNotFound = (message: string) => new Error(message);

const buildRequest = (
  headers: Record<string, string | string[] | undefined> = {},
  query: { environment?: unknown } = {},
) =>
  ({
    headers,
    query,
    ksefEnvironment: undefined,
    server: {
      httpErrors: {
        badRequest: mockBadRequest,
        notFound: mockNotFound,
      },
    },
  }) as unknown as FastifyRequest;

describe('readRequestedKsefEnvironment()', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns PRODUCTION when x-ksef-environment header is PRODUCTION', () => {
    const request = buildRequest({ [KSEF_ENVIRONMENT_HEADER]: 'PRODUCTION' });

    const result = readRequestedKsefEnvironment(request);

    expect(result).toBe('PRODUCTION');
  });

  it('returns TEST when x-ksef-environment header is TEST', () => {
    const request = buildRequest({ [KSEF_ENVIRONMENT_HEADER]: 'TEST' });

    const result = readRequestedKsefEnvironment(request);

    expect(result).toBe('TEST');
  });

  it('returns null when no header is present', () => {
    const request = buildRequest({});

    const result = readRequestedKsefEnvironment(request);

    expect(result).toBeNull();
  });

  it('returns the environment query parameter when no header is present', () => {
    const request = buildRequest({}, { environment: 'PRODUCTION' });

    const result = readRequestedKsefEnvironment(request);

    expect(result).toBe('PRODUCTION');
  });

  it('prefers the header over the environment query parameter', () => {
    const request = buildRequest(
      { [KSEF_ENVIRONMENT_HEADER]: 'TEST' },
      { environment: 'PRODUCTION' },
    );

    const result = readRequestedKsefEnvironment(request);

    expect(result).toBe('TEST');
  });

  it('throws badRequest when the environment query parameter is invalid', () => {
    const request = buildRequest({}, { environment: 'STAGING' });

    expect(() => readRequestedKsefEnvironment(request)).toThrow(
      'Invalid environment query parameter. Expected TEST or PRODUCTION.',
    );
  });

  it('returns null when header value is undefined', () => {
    const request = buildRequest({ [KSEF_ENVIRONMENT_HEADER]: undefined });

    const result = readRequestedKsefEnvironment(request);

    expect(result).toBeNull();
  });

  it('uses the first value when header is an array', () => {
    const request = buildRequest({ [KSEF_ENVIRONMENT_HEADER]: ['PRODUCTION', 'TEST'] });

    const result = readRequestedKsefEnvironment(request);

    expect(result).toBe('PRODUCTION');
  });

  it('throws badRequest when header value is invalid', () => {
    const request = buildRequest({ [KSEF_ENVIRONMENT_HEADER]: 'STAGING' });

    expect(() => readRequestedKsefEnvironment(request)).toThrow(
      `Invalid ${KSEF_ENVIRONMENT_HEADER} header. Expected TEST or PRODUCTION.`,
    );
  });

  it('caches resolved environment on request.ksefEnvironment', () => {
    const request = buildRequest({ [KSEF_ENVIRONMENT_HEADER]: 'PRODUCTION' });

    readRequestedKsefEnvironment(request);

    expect(request.ksefEnvironment).toBe('PRODUCTION');
  });

  it('returns cached ksefEnvironment without re-reading headers', () => {
    const request = buildRequest({});
    request.ksefEnvironment = 'TEST';

    const result = readRequestedKsefEnvironment(request);

    expect(result).toBe('TEST');
  });
});

describe('resolveEffectiveKsefEnvironment()', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns TEST when no header and company default is TEST', async () => {
    const companyFindUnique = vi.fn(async () => ({ ksefEnv: 'TEST' }));
    const prisma = {
      company: { findUnique: companyFindUnique },
    } as unknown as PrismaClient;

    const request = buildRequest({});

    const result = await resolveEffectiveKsefEnvironment(request, prisma, 'company-1');

    expect(result).toBe('TEST');
    expect(companyFindUnique).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      select: { ksefEnv: true },
    });
  });

  it('returns PRODUCTION when x-ksef-environment header is PRODUCTION (overrides company default)', async () => {
    const companyFindUnique = vi.fn(async () => ({ ksefEnv: 'TEST' }));
    const prisma = {
      company: { findUnique: companyFindUnique },
    } as unknown as PrismaClient;

    const request = buildRequest({ [KSEF_ENVIRONMENT_HEADER]: 'PRODUCTION' });

    const result = await resolveEffectiveKsefEnvironment(request, prisma, 'company-1');

    expect(result).toBe('PRODUCTION');
    expect(companyFindUnique).not.toHaveBeenCalled();
  });

  it('returns company default PRODUCTION when no header and company.ksefEnv is PRODUCTION', async () => {
    const companyFindUnique = vi.fn(async () => ({ ksefEnv: 'PRODUCTION' }));
    const prisma = {
      company: { findUnique: companyFindUnique },
    } as unknown as PrismaClient;

    const request = buildRequest({});

    const result = await resolveEffectiveKsefEnvironment(request, prisma, 'company-1');

    expect(result).toBe('PRODUCTION');
  });

  it('returns cookie environment when header is missing and active_ksef_environment cookie is present', async () => {
    const companyFindUnique = vi.fn(async () => ({ ksefEnv: 'TEST' }));
    const prisma = {
      company: { findUnique: companyFindUnique },
    } as unknown as PrismaClient;

    const request = buildRequest({ cookie: 'active_ksef_environment=PRODUCTION; auth_token=token' });

    const result = await resolveEffectiveKsefEnvironment(request, prisma, 'company-1');

    expect(result).toBe('PRODUCTION');
    expect(companyFindUnique).not.toHaveBeenCalled();
  });

  it('returns company ksefEnv value when it is null (no automatic TEST fallback)', async () => {
    const companyFindUnique = vi.fn(async () => ({ ksefEnv: null }));
    const prisma = {
      company: { findUnique: companyFindUnique },
    } as unknown as PrismaClient;

    const request = buildRequest({});

    const result = await resolveEffectiveKsefEnvironment(request, prisma, 'company-1');

    expect(result).toBeNull();
  });

  it('throws notFound when company does not exist', async () => {
    const companyFindUnique = vi.fn(async () => null);
    const prisma = {
      company: { findUnique: companyFindUnique },
    } as unknown as PrismaClient;

    const request = buildRequest({});

    await expect(resolveEffectiveKsefEnvironment(request, prisma, 'company-missing')).rejects.toThrow(
      'Company not found',
    );
  });

  it('caches resolved environment on request.ksefEnvironment after company lookup', async () => {
    const companyFindUnique = vi.fn(async () => ({ ksefEnv: 'PRODUCTION' }));
    const prisma = {
      company: { findUnique: companyFindUnique },
    } as unknown as PrismaClient;

    const request = buildRequest({});

    await resolveEffectiveKsefEnvironment(request, prisma, 'company-1');

    expect(request.ksefEnvironment).toBe('PRODUCTION');
  });

  it('invalid header value throws before reaching company lookup', async () => {
    const companyFindUnique = vi.fn(async () => ({ ksefEnv: 'TEST' }));
    const prisma = {
      company: { findUnique: companyFindUnique },
    } as unknown as PrismaClient;

    const request = buildRequest({ [KSEF_ENVIRONMENT_HEADER]: 'INVALID' });

    await expect(resolveEffectiveKsefEnvironment(request, prisma, 'company-1')).rejects.toThrow(
      `Invalid ${KSEF_ENVIRONMENT_HEADER} header`,
    );
    expect(companyFindUnique).not.toHaveBeenCalled();
  });
});

describe('requireExplicitKsefEnvironment()', () => {
  it('accepts only one exact supported header value', () => {
    const request = buildRequest({ [KSEF_ENVIRONMENT_HEADER]: 'PRODUCTION' });

    expect(requireExplicitKsefEnvironment(request)).toBe('PRODUCTION');
  });

  it('rejects a missing, repeated, cookie-only, or invalid header', () => {
    for (const headers of [
      {},
      { [KSEF_ENVIRONMENT_HEADER]: ['TEST', 'PRODUCTION'] },
      { cookie: 'active_ksef_environment=PRODUCTION' },
      { [KSEF_ENVIRONMENT_HEADER]: 'production' },
    ]) {
      expect(() => requireExplicitKsefEnvironment(buildRequest(headers))).toThrow(
        `Invalid or missing ${KSEF_ENVIRONMENT_HEADER} header`,
      );
    }
  });
});

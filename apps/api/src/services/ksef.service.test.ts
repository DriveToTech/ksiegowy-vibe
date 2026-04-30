import type { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refreshAuthSession = vi.fn();
const initAuthSession = vi.fn();

vi.mock('@ksiegowy/ksef-client', () => ({
  createKsefClient: vi.fn((input: { environment: 'test' | 'production' }) => ({
    environment: input.environment,
    refreshAuthSession,
    initAuthSession,
  })),
}));

vi.mock('@ksiegowy/shared-utils', () => ({
  decrypt: vi.fn((value: string) => `decrypted:${value}`),
  encrypt: vi.fn((value: string) => ({ enc: `encrypted:${value}`, iv: 'generated-iv' })),
}));

import { createKsefClient } from '@ksiegowy/ksef-client';
import { decrypt, encrypt } from '@ksiegowy/shared-utils';
import { getOrCreateKsefSession, initKsefSession, pollKsefSubmissionStatus } from './ksef.service.js';

describe('initKsefSession()', () => {
  beforeEach(() => {
    initAuthSession.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      refreshTokenValidUntil: '2026-05-01T10:00:00.000Z',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.KSEF_AUTH_TOKEN;
  });

  it('uses the selected environment credential instead of the legacy company token', async () => {
    const ksefSessionUpsert = vi.fn(async () => ({}));
    const companyFindUnique = vi.fn(async () => ({
      nip: '8990001122',
      ksefEnv: 'TEST',
      ksefTokenEnc: 'legacy-token-enc',
      ksefTokenIv: 'legacy-token-iv',
      ksefCredentials: [{ tokenEnc: 'production-token-enc', tokenIv: 'production-token-iv' }],
    }));

    const prisma = {
      company: {
        findUnique: companyFindUnique,
      },
      ksefSession: {
        upsert: ksefSessionUpsert,
      },
    } as unknown as PrismaClient;

    const accessToken = await initKsefSession(
      prisma,
      'company-1',
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'PRODUCTION',
    );

    expect(accessToken).toBe('access-token');
    expect(vi.mocked(createKsefClient)).toHaveBeenCalledWith({ environment: 'production' });
    expect(initAuthSession).toHaveBeenCalledWith({
      ksefToken: 'decrypted:production-token-enc',
      nip: '8990001122',
    });
    expect(ksefSessionUpsert).toHaveBeenCalledWith({
      where: {
        companyId_environment: {
          companyId: 'company-1',
          environment: 'PRODUCTION',
        },
      },
      create: {
        companyId: 'company-1',
        environment: 'PRODUCTION',
        tokenEnc: 'encrypted:refresh-token',
        tokenIv: 'generated-iv',
        expiresAt: new Date('2026-05-01T10:00:00.000Z'),
        lastUsedAt: expect.any(Date),
      },
      update: {
        tokenEnc: 'encrypted:refresh-token',
        tokenIv: 'generated-iv',
        expiresAt: new Date('2026-05-01T10:00:00.000Z'),
        lastUsedAt: expect.any(Date),
      },
    });
    expect(vi.mocked(decrypt)).toHaveBeenCalledWith(
      'production-token-enc',
      'production-token-iv',
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    );
    expect(vi.mocked(encrypt)).toHaveBeenCalledWith(
      'refresh-token',
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    );
  });

  it('limits legacy fallback to the matching default environment', async () => {
    const companyFindUnique = vi.fn(async () => ({
      nip: '8990001122',
      ksefEnv: 'TEST',
      ksefTokenEnc: 'legacy-token-enc',
      ksefTokenIv: 'legacy-token-iv',
      ksefCredentials: [],
    }));

    const prisma = {
      company: {
        findUnique: companyFindUnique,
      },
      ksefSession: {
        upsert: vi.fn(async () => ({})),
      },
    } as unknown as PrismaClient;

    await expect(
      initKsefSession(
        prisma,
        'company-1',
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        'PRODUCTION',
      ),
    ).rejects.toThrow('Company company-1 has no KSeF token configured for PRODUCTION');
  });
});

describe('getOrCreateKsefSession()', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('refreshes the session token using the company and environment compound key', async () => {
    refreshAuthSession.mockResolvedValue('refreshed-access-token');

    const ksefSessionFindUnique = vi.fn(async () => ({
      expiresAt: new Date('2099-01-01T10:00:00.000Z'),
      tokenEnc: 'stored-refresh-token-enc',
      tokenIv: 'stored-refresh-token-iv',
    }));
    const ksefSessionUpdate = vi.fn(async () => ({}));

    const prisma = {
      ksefSession: {
        findUnique: ksefSessionFindUnique,
        update: ksefSessionUpdate,
      },
    } as unknown as PrismaClient;

    const accessToken = await getOrCreateKsefSession(
      prisma,
      'company-1',
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'PRODUCTION',
    );

    expect(accessToken).toBe('refreshed-access-token');
    expect(ksefSessionFindUnique).toHaveBeenCalledWith({
      where: {
        companyId_environment: {
          companyId: 'company-1',
          environment: 'PRODUCTION',
        },
      },
    });
    expect(ksefSessionUpdate).toHaveBeenCalledWith({
      where: {
        companyId_environment: {
          companyId: 'company-1',
          environment: 'PRODUCTION',
        },
      },
      data: { lastUsedAt: expect.any(Date) },
    });
    expect(vi.mocked(createKsefClient)).toHaveBeenCalledWith({ environment: 'production' });
    expect(refreshAuthSession).toHaveBeenCalledWith('decrypted:stored-refresh-token-enc');
  });
});

describe('pollKsefSubmissionStatus()', () => {
  it('restores accepted invoice state from submission history before polling a newer pending attempt', async () => {
    const ksefSubmissionFindUnique = vi.fn(async () => ({
      id: 'submission-pending-2',
      environment: 'TEST',
      invoiceId: 'invoice-1',
      referenceNumber: '20260415-EE-16E5AD7000-00F836FC7C-45',
      sessionReferenceNumber: '20260415-SO-16E5A6B000-B28515B915-67',
      invoice: {
        id: 'invoice-1',
        ksefStatus: 'SUBMITTED',
        ksefReference: '8982160168-20260411-5144C4800000-D5',
        ksefAcceptedAt: new Date('2026-04-11T09:33:32.400Z')
      }
    }));
    const ksefSubmissionFindFirst = vi.fn(async () => ({
      ksefReference: '8982160168-20260411-5144C4800000-D5',
      acceptedAt: new Date('2026-04-11T09:33:32.400Z')
    }));
    const invoiceUpdate = vi.fn(async () => ({}));

    const prisma = {
      ksefSubmission: {
        findUnique: ksefSubmissionFindUnique,
        findFirst: ksefSubmissionFindFirst
      },
      invoice: {
        update: invoiceUpdate
      }
    } as unknown as PrismaClient;

    const result = await pollKsefSubmissionStatus(
      prisma,
      'submission-pending-2',
      'company-1',
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    );

    expect(result).toEqual({
      status: 'accepted',
      ksefReferenceNumber: '8982160168-20260411-5144C4800000-D5'
    });
    expect(ksefSubmissionFindFirst).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        invoiceId: 'invoice-1',
        environment: 'TEST',
        status: 'ACCEPTED',
        ksefReference: { not: null }
      },
      orderBy: [{ acceptedAt: 'desc' }, { attemptNumber: 'desc' }],
      select: {
        ksefReference: true,
        acceptedAt: true
      }
    });
    expect(invoiceUpdate).toHaveBeenCalledWith({
      where: { id: 'invoice-1' },
      data: {
        ksefStatus: 'ACCEPTED',
        ksefReference: '8982160168-20260411-5144C4800000-D5',
        ksefAcceptedAt: new Date('2026-04-11T09:33:32.400Z')
      }
    });
  });
});

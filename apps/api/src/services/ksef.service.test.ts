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
import { getOrCreateKsefSession, initKsefSession, pollKsefSubmissionStatus, upsertInvoiceKsefState, loadCompanyKsefAuthConfiguration } from './ksef.service.js';

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

  it('triggers initKsefSession when TEST session exists but PRODUCTION does not', async () => {
    initAuthSession.mockResolvedValue({
      accessToken: 'new-production-access-token',
      refreshToken: 'new-production-refresh-token',
      refreshTokenValidUntil: '2026-05-01T10:00:00.000Z',
    });

    const ksefSessionFindUnique = vi.fn(async () => null);
    const ksefSessionUpsert = vi.fn(async () => ({}));
    const companyFindUnique = vi.fn(async () => ({
      nip: '8990001122',
      ksefEnv: 'PRODUCTION',
      ksefTokenEnc: 'production-legacy-enc',
      ksefTokenIv: 'production-legacy-iv',
      ksefCredentials: [{ tokenEnc: 'production-cred-enc', tokenIv: 'production-cred-iv' }],
    }));

    const prisma = {
      ksefSession: {
        findUnique: ksefSessionFindUnique,
        upsert: ksefSessionUpsert,
      },
      company: {
        findUnique: companyFindUnique,
      },
    } as unknown as PrismaClient;

    const accessToken = await getOrCreateKsefSession(
      prisma,
      'company-1',
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'PRODUCTION',
    );

    expect(accessToken).toBe('new-production-access-token');
    expect(ksefSessionFindUnique).toHaveBeenCalledWith({
      where: {
        companyId_environment: {
          companyId: 'company-1',
          environment: 'PRODUCTION',
        },
      },
    });
    expect(initAuthSession).toHaveBeenCalled();
  });

  it('uses its own session when both TEST and PRODUCTION sessions exist', async () => {
    refreshAuthSession.mockResolvedValue('test-refreshed-token');

    const ksefSessionFindUnique = vi.fn(async () => ({
      expiresAt: new Date('2099-01-01T10:00:00.000Z'),
      tokenEnc: 'test-session-enc',
      tokenIv: 'test-session-iv',
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
      'TEST',
    );

    expect(accessToken).toBe('test-refreshed-token');
    expect(ksefSessionFindUnique).toHaveBeenCalledWith({
      where: {
        companyId_environment: {
          companyId: 'company-1',
          environment: 'TEST',
        },
      },
    });
    expect(vi.mocked(createKsefClient)).toHaveBeenCalledWith({ environment: 'test' });
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
    const invoiceKsefStateUpsert = vi.fn(async () => ({}));

    const prisma = {
      ksefSubmission: {
        findUnique: ksefSubmissionFindUnique,
        findFirst: ksefSubmissionFindFirst
      },
      invoiceKsefState: {
        upsert: invoiceKsefStateUpsert
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
    expect(invoiceKsefStateUpsert).toHaveBeenCalledWith({
      where: {
        invoiceId_environment: {
          invoiceId: 'invoice-1',
          environment: 'TEST',
        }
      },
      create: {
        invoiceId: 'invoice-1',
        environment: 'TEST',
        status: 'ACCEPTED',
        ksefReference: '8982160168-20260411-5144C4800000-D5',
        acceptedAt: new Date('2026-04-11T09:33:32.400Z')
      },
      update: {
        status: 'ACCEPTED',
        ksefReference: '8982160168-20260411-5144C4800000-D5',
        acceptedAt: new Date('2026-04-11T09:33:32.400Z')
      }
    });
  });
});

describe('upsertInvoiceKsefState()', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses the invoiceId_environment compound unique key for upsert', async () => {
    const invoiceKsefStateUpsert = vi.fn(async () => ({}));
    const prisma = {
      invoiceKsefState: { upsert: invoiceKsefStateUpsert },
    } as unknown as PrismaClient;

    await upsertInvoiceKsefState(prisma, {
      invoiceId: 'invoice-1',
      environment: 'PRODUCTION',
      status: 'SUBMITTED',
      submittedAt: new Date('2026-04-15T10:00:00.000Z'),
      lastSubmissionId: 'submission-1',
    });

    expect(invoiceKsefStateUpsert).toHaveBeenCalledWith({
      where: {
        invoiceId_environment: {
          invoiceId: 'invoice-1',
          environment: 'PRODUCTION',
        },
      },
      create: {
        invoiceId: 'invoice-1',
        environment: 'PRODUCTION',
        status: 'SUBMITTED',
        ksefReference: null,
        submittedAt: new Date('2026-04-15T10:00:00.000Z'),
        lastSubmissionId: 'submission-1',
      },
      update: {
        status: 'SUBMITTED',
        ksefReference: null,
        submittedAt: new Date('2026-04-15T10:00:00.000Z'),
        lastSubmissionId: 'submission-1',
      },
    });
  });

  it('allows TEST and PRODUCTION states to coexist independently for the same invoice', async () => {
    const invoiceKsefStateUpsert = vi.fn(async () => ({}));
    const prisma = {
      invoiceKsefState: { upsert: invoiceKsefStateUpsert },
    } as unknown as PrismaClient;

    await upsertInvoiceKsefState(prisma, {
      invoiceId: 'invoice-1',
      environment: 'TEST',
      status: 'ACCEPTED',
      ksefReference: 'TEST-REF-001',
      acceptedAt: new Date('2026-04-10T10:00:00.000Z'),
    });

    await upsertInvoiceKsefState(prisma, {
      invoiceId: 'invoice-1',
      environment: 'PRODUCTION',
      status: 'NOT_SENT',
    });

    expect(invoiceKsefStateUpsert).toHaveBeenCalledTimes(2);
    expect(invoiceKsefStateUpsert).toHaveBeenNthCalledWith(1, {
      where: {
        invoiceId_environment: { invoiceId: 'invoice-1', environment: 'TEST' },
      },
      create: expect.objectContaining({ environment: 'TEST', status: 'ACCEPTED', ksefReference: 'TEST-REF-001' }),
      update: expect.objectContaining({ status: 'ACCEPTED', ksefReference: 'TEST-REF-001' }),
    });
    expect(invoiceKsefStateUpsert).toHaveBeenNthCalledWith(2, {
      where: {
        invoiceId_environment: { invoiceId: 'invoice-1', environment: 'PRODUCTION' },
      },
      create: expect.objectContaining({ environment: 'PRODUCTION', status: 'NOT_SENT' }),
      update: expect.objectContaining({ status: 'NOT_SENT' }),
    });
  });
});

describe('loadCompanyKsefAuthConfiguration()', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.KSEF_AUTH_TOKEN;
  });

  it('returns the per-environment credential token when available', async () => {
    const companyFindUnique = vi.fn(async () => ({
      nip: '8990001122',
      ksefEnv: 'TEST',
      ksefTokenEnc: 'legacy-enc',
      ksefTokenIv: 'legacy-iv',
      ksefCredentials: [{ tokenEnc: 'production-cred-enc', tokenIv: 'production-cred-iv' }],
    }));

    const prisma = {
      company: { findUnique: companyFindUnique },
    } as unknown as PrismaClient;

    const result = await loadCompanyKsefAuthConfiguration(
      prisma,
      'company-1',
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'PRODUCTION',
    );

    expect(result).toEqual({
      nip: '8990001122',
      selectedEnvironment: 'PRODUCTION',
      ksefToken: 'decrypted:production-cred-enc',
    });
  });

  it('throws when no token is configured for the selected environment', async () => {
    const companyFindUnique = vi.fn(async () => ({
      nip: '8990001122',
      ksefEnv: 'TEST',
      ksefTokenEnc: null,
      ksefTokenIv: null,
      ksefCredentials: [],
    }));

    const prisma = {
      company: { findUnique: companyFindUnique },
    } as unknown as PrismaClient;

    await expect(
      loadCompanyKsefAuthConfiguration(
        prisma,
        'company-1',
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        'PRODUCTION',
      ),
    ).rejects.toThrow('Company company-1 has no KSeF token configured for PRODUCTION');
  });

  it('falls back to legacy token only when company.ksefEnv matches selectedEnvironment', async () => {
    const companyFindUnique = vi.fn(async () => ({
      nip: '8990001122',
      ksefEnv: 'PRODUCTION',
      ksefTokenEnc: 'legacy-enc',
      ksefTokenIv: 'legacy-iv',
      ksefCredentials: [],
    }));

    const prisma = {
      company: { findUnique: companyFindUnique },
    } as unknown as PrismaClient;

    const result = await loadCompanyKsefAuthConfiguration(
      prisma,
      'company-1',
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'PRODUCTION',
    );

    expect(result.ksefToken).toBe('decrypted:legacy-enc');
  });

  it('does not fall back to legacy token when company.ksefEnv does not match selectedEnvironment', async () => {
    const companyFindUnique = vi.fn(async () => ({
      nip: '8990001122',
      ksefEnv: 'TEST',
      ksefTokenEnc: 'legacy-enc',
      ksefTokenIv: 'legacy-iv',
      ksefCredentials: [],
    }));

    const prisma = {
      company: { findUnique: companyFindUnique },
    } as unknown as PrismaClient;

    await expect(
      loadCompanyKsefAuthConfiguration(
        prisma,
        'company-1',
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        'PRODUCTION',
      ),
    ).rejects.toThrow('Company company-1 has no KSeF token configured for PRODUCTION');
  });

  it('falls back to KSEF_AUTH_TOKEN env var only for TEST environment', async () => {
    process.env.KSEF_AUTH_TOKEN = 'env-test-token';

    const companyFindUnique = vi.fn(async () => ({
      nip: '8990001122',
      ksefEnv: 'PRODUCTION',
      ksefTokenEnc: null,
      ksefTokenIv: null,
      ksefCredentials: [],
    }));

    const prisma = {
      company: { findUnique: companyFindUnique },
    } as unknown as PrismaClient;

    const result = await loadCompanyKsefAuthConfiguration(
      prisma,
      'company-1',
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'TEST',
    );

    expect(result.ksefToken).toBe('env-test-token');
  });

  it('does not fall back to KSEF_AUTH_TOKEN env var for PRODUCTION environment', async () => {
    process.env.KSEF_AUTH_TOKEN = 'env-test-token';

    const companyFindUnique = vi.fn(async () => ({
      nip: '8990001122',
      ksefEnv: 'TEST',
      ksefTokenEnc: null,
      ksefTokenIv: null,
      ksefCredentials: [],
    }));

    const prisma = {
      company: { findUnique: companyFindUnique },
    } as unknown as PrismaClient;

    await expect(
      loadCompanyKsefAuthConfiguration(
        prisma,
        'company-1',
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        'PRODUCTION',
      ),
    ).rejects.toThrow('Company company-1 has no KSeF token configured for PRODUCTION');
  });

  it('throws when company is not found', async () => {
    const companyFindUnique = vi.fn(async () => null);

    const prisma = {
      company: { findUnique: companyFindUnique },
    } as unknown as PrismaClient;

    await expect(
      loadCompanyKsefAuthConfiguration(
        prisma,
        'company-missing',
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        'TEST',
      ),
    ).rejects.toThrow('Company company-missing not found');
  });
});

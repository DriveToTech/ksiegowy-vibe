import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { pollKsefSubmissionStatus } from './ksef.service.js';

describe('pollKsefSubmissionStatus()', () => {
  it('restores accepted invoice state from submission history before polling a newer pending attempt', async () => {
    const ksefSubmissionFindUnique = vi.fn(async () => ({
      id: 'submission-pending-2',
      invoiceId: 'invoice-1',
      referenceNumber: '20260415-EE-16E5AD7000-00F836FC7C-45',
      sessionReferenceNumber: '20260415-SO-16E5A6B000-B28515B915-67',
      company: { ksefEnv: 'TEST' },
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

import type { KsefEnvironment } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  buildInvoiceKsefStateInclude,
  resolveInvoiceKsefState,
} from './outgoing.js';

describe('resolveInvoiceKsefState()', () => {
  it('returns NOT_SENT when no ksefStates match the active environment', () => {
    const invoice = { ksefStates: [] };

    const result = resolveInvoiceKsefState(invoice);

    expect(result).toEqual({ status: 'NOT_SENT', ksefReference: null });
  });

  it('returns NOT_SENT when ksefStates is undefined', () => {
    const invoice = {};

    const result = resolveInvoiceKsefState(invoice);

    expect(result).toEqual({ status: 'NOT_SENT', ksefReference: null });
  });

  it('returns the matching environment state when present', () => {
    const invoice = {
      ksefStates: [{ status: 'ACCEPTED', ksefReference: '8982160168-20260411-5144C4800000-D5' }],
    };

    const result = resolveInvoiceKsefState(invoice);

    expect(result).toEqual({
      status: 'ACCEPTED',
      ksefReference: '8982160168-20260411-5144C4800000-D5',
    });
  });

  it('returns the first match when multiple states exist', () => {
    const invoice = {
      ksefStates: [
        { status: 'SUBMITTED', ksefReference: null },
        { status: 'ACCEPTED', ksefReference: '8982160168-20260411-5144C4800000-D5' },
      ],
    };

    const result = resolveInvoiceKsefState(invoice);

    expect(result).toEqual({ status: 'SUBMITTED', ksefReference: null });
  });

  it('returns state with null ksefReference when not yet accepted', () => {
    const invoice = {
      ksefStates: [{ status: 'SUBMITTED', ksefReference: null }],
    };

    const result = resolveInvoiceKsefState(invoice);

    expect(result).toEqual({ status: 'SUBMITTED', ksefReference: null });
  });
});

describe('buildInvoiceKsefStateInclude()', () => {
  it('produces the correct Prisma include shape for TEST environment', () => {
    const result = buildInvoiceKsefStateInclude('TEST' as KsefEnvironment);

    expect(result).toEqual({
      where: { environment: 'TEST' },
      select: {
        status: true,
        ksefReference: true,
      },
    });
  });

  it('produces the correct Prisma include shape for PRODUCTION environment', () => {
    const result = buildInvoiceKsefStateInclude('PRODUCTION' as KsefEnvironment);

    expect(result).toEqual({
      where: { environment: 'PRODUCTION' },
      select: {
        status: true,
        ksefReference: true,
      },
    });
  });
});

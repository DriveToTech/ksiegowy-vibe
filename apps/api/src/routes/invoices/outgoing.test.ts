import type { KsefEnvironment } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  buildInvoiceKsefStateInclude,
  getCorrectionAmountPrefix,
  mapCorrectionModeToDatabase,
  normalizeCorrectionRequest,
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

describe('normalizeCorrectionRequest()', () => {
  it('defaults to cancellation mode and negates values', () => {
    const result = normalizeCorrectionRequest({}, 'FV 1/4/2026');

    expect(result).toEqual({
      correctionMode: 'CANCELLATION',
      correctedInvoiceNumber: null,
      correctionReason: null,
      amountPrefix: '-',
    });
  });

  it('requires corrected invoice number or reason for formal corrections', () => {
    expect(() => normalizeCorrectionRequest({ correctionMode: 'formal' }, 'FV 1/4/2026')).toThrow(
      'Formal correction requires correctedInvoiceNumber or reason',
    );
  });

  it('rejects unchanged corrected invoice number in formal mode', () => {
    expect(() => normalizeCorrectionRequest(
      { correctionMode: 'formal', correctedInvoiceNumber: 'FV 1/4/2026' },
      'FV 1/4/2026',
    )).toThrow('Corrected invoice number must differ from the original invoice number');
  });

  it('rejects corrected invoice number in cancellation mode', () => {
    expect(() => normalizeCorrectionRequest(
      { correctionMode: 'cancellation', correctedInvoiceNumber: 'FV 2/4/2026' },
      'FV 1/4/2026',
    )).toThrow('correctedInvoiceNumber is only supported for formal corrections');
  });

  it('builds formal correction reason with corrected invoice number', () => {
    const result = normalizeCorrectionRequest(
      {
        correctionMode: 'formal',
        correctedInvoiceNumber: 'FV 2/4/2026',
        reason: 'Zmiana numeracji',
      },
      'FV 1/4/2026',
    );

    expect(result).toEqual({
      correctionMode: 'FORMAL',
      correctedInvoiceNumber: 'FV 2/4/2026',
      correctionReason: 'Korekta numeru faktury: bylo FV 1/4/2026, powinno byc FV 2/4/2026. Zmiana numeracji',
      amountPrefix: '',
    });
  });
});

describe('correction mode helpers', () => {
  it('maps correction modes to database values', () => {
    expect(mapCorrectionModeToDatabase(undefined)).toBe('CANCELLATION');
    expect(mapCorrectionModeToDatabase('cancellation')).toBe('CANCELLATION');
    expect(mapCorrectionModeToDatabase('formal')).toBe('FORMAL');
  });

  it('returns amount prefix per correction mode', () => {
    expect(getCorrectionAmountPrefix('CANCELLATION')).toBe('-');
    expect(getCorrectionAmountPrefix('FORMAL')).toBe('');
  });
});

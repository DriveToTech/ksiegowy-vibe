import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calcLineTotals, emptyLine } from './invoice-line-calculation';

describe('emptyLine()', () => {
  it('returns a default line and lives in a module without the client directive (callable from server components)', () => {
    expect(emptyLine()).toEqual({ name: '', quantity: '1', unit: 'szt.', unitNetPrice: '', vatRate: '23' });
    expect(readFileSync(new URL('./invoice-line-calculation.ts', import.meta.url), 'utf8')).not.toContain("'use client'");
  });
});

describe('calcLineTotals()', () => {
  it('sums net, vat and gross', () => {
    expect(calcLineTotals([{ ...emptyLine(), quantity: '2', unitNetPrice: '100' }])).toEqual({ net: 200, vat: 46, gross: 246 });
  });
});

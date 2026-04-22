import { describe, expect, it } from 'vitest';

import { computeVatLineTotals } from './vat-calc.js';

describe('computeVatLineTotals()', () => {
  it('calculates 23% VAT on round numbers', () => {
    expect(computeVatLineTotals({ quantity: 2, unitNetPrice: 100, vatRatePercent: 23 })).toEqual({
      net: 200,
      vat: 46,
      gross: 246
    });
  });

  it('calculates 8% VAT', () => {
    expect(computeVatLineTotals({ quantity: 1, unitNetPrice: 50, vatRatePercent: 8 })).toEqual({
      net: 50,
      vat: 4,
      gross: 54
    });
  });

  it('calculates 5% VAT', () => {
    expect(computeVatLineTotals({ quantity: 1, unitNetPrice: 40, vatRatePercent: 5 })).toEqual({
      net: 40,
      vat: 2,
      gross: 42
    });
  });

  it('calculates 0% VAT', () => {
    expect(computeVatLineTotals({ quantity: 3, unitNetPrice: 10, vatRatePercent: 0 })).toEqual({
      net: 30,
      vat: 0,
      gross: 30
    });
  });

  it('calculates 23% on a unit price of 1.00', () => {
    expect(computeVatLineTotals({ quantity: 1, unitNetPrice: 1, vatRatePercent: 23 })).toEqual({
      net: 1,
      vat: 0.23,
      gross: 1.23
    });
  });

  it('calculates with fractional quantity', () => {
    expect(computeVatLineTotals({ quantity: 0.5, unitNetPrice: 10, vatRatePercent: 23 })).toEqual({
      net: 5,
      vat: 1.15,
      gross: 6.15
    });
  });

  it('rounds net to 2 decimal places', () => {
    // 1 * 1.005 in float is 1.005 exactly; Math.round((1.005 + EPSILON) * 100) / 100 = 1.01
    expect(computeVatLineTotals({ quantity: 1, unitNetPrice: 1.005, vatRatePercent: 0 })).toEqual({
      net: 1.01,
      vat: 0,
      gross: 1.01
    });
  });

  it('gross equals net + vat', () => {
    const result = computeVatLineTotals({ quantity: 7, unitNetPrice: 13.33, vatRatePercent: 23 });
    expect(result.gross).toBeCloseTo(result.net + result.vat, 2);
  });
});

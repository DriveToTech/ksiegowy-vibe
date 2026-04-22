import type { InvoiceData, InvoiceLineInput } from '@ksiegowy/types';
import { describe, expect, it } from 'vitest';

import { Fa3ContractError } from './contracts.js';
import { assertInvoiceMathConsistency, calculateInvoiceTotals } from './invoice-math.js';

const seller = { name: 'Seller', nip: '1234563218', addressLine1: 'ul. Sprzedawcy 1' };
const buyer = { name: 'Buyer', nip: '9876543210', addressLine1: 'ul. Kupca 1' };

const makeInvoice = (lines: InvoiceLineInput[], overrides: Partial<InvoiceData> = {}): InvoiceData => ({
  invoiceNumber: 'FV 1/1/2025',
  issueDate: '2025-01-01',
  currency: 'PLN',
  seller,
  buyer,
  lines,
  totalNet: '0',
  totalVat: '0',
  totalGross: '0',
  ...overrides
});

describe('calculateInvoiceTotals()', () => {
  it('calculates a single line at 23% VAT', () => {
    const result = calculateInvoiceTotals(makeInvoice([
      { description: 'Service', quantity: '1', unit: 'szt', unitNetPrice: '100.00', vatRate: '23' }
    ]));

    expect(result.totals).toEqual({ net: '100.00', vat: '23.00', gross: '123.00' });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ net: '100.00', vat: '23.00', gross: '123.00' });
  });

  it('calculates a single line at 8% VAT', () => {
    const result = calculateInvoiceTotals(makeInvoice([
      { description: 'Service', quantity: '1', unit: 'szt', unitNetPrice: '50.00', vatRate: '8' }
    ]));

    expect(result.totals).toEqual({ net: '50.00', vat: '4.00', gross: '54.00' });
  });

  it('calculates zero VAT for rate "zw"', () => {
    const result = calculateInvoiceTotals(makeInvoice([
      { description: 'Exempt', quantity: '1', unit: 'szt', unitNetPrice: '200.00', vatRate: 'zw' }
    ]));

    expect(result.totals).toEqual({ net: '200.00', vat: '0.00', gross: '200.00' });
  });

  it('calculates zero VAT for rate "np"', () => {
    const result = calculateInvoiceTotals(makeInvoice([
      { description: 'Outside scope', quantity: '1', unit: 'szt', unitNetPrice: '100.00', vatRate: 'np' }
    ]));

    expect(result.totals.vat).toBe('0.00');
  });

  it('calculates zero VAT for rate "oo"', () => {
    const result = calculateInvoiceTotals(makeInvoice([
      { description: 'Reverse charge', quantity: '1', unit: 'szt', unitNetPrice: '100.00', vatRate: 'oo' }
    ]));

    expect(result.totals.vat).toBe('0.00');
  });

  it('calculates zero VAT for rate "0"', () => {
    const result = calculateInvoiceTotals(makeInvoice([
      { description: 'Zero-rated', quantity: '1', unit: 'szt', unitNetPrice: '100.00', vatRate: '0' }
    ]));

    expect(result.totals.vat).toBe('0.00');
    expect(result.totals.gross).toBe('100.00');
  });

  it('sums multiple lines with the same rate', () => {
    const result = calculateInvoiceTotals(makeInvoice([
      { description: 'A', quantity: '1', unit: 'szt', unitNetPrice: '100.00', vatRate: '23' },
      { description: 'B', quantity: '2', unit: 'szt', unitNetPrice: '50.00', vatRate: '23' }
    ]));

    expect(result.totals).toEqual({ net: '200.00', vat: '46.00', gross: '246.00' });
    expect(result.lines).toHaveLength(2);
  });

  it('sums multiple lines with mixed rates', () => {
    const result = calculateInvoiceTotals(makeInvoice([
      { description: 'A', quantity: '1', unit: 'szt', unitNetPrice: '100.00', vatRate: '23' },
      { description: 'B', quantity: '1', unit: 'szt', unitNetPrice: '50.00', vatRate: '8' }
    ]));

    expect(result.totals).toEqual({ net: '150.00', vat: '27.00', gross: '177.00' });
  });

  it('groups VAT breakdown by rate', () => {
    const result = calculateInvoiceTotals(makeInvoice([
      { description: 'A', quantity: '1', unit: 'szt', unitNetPrice: '100.00', vatRate: '23' },
      { description: 'B', quantity: '1', unit: 'szt', unitNetPrice: '200.00', vatRate: '23' },
      { description: 'C', quantity: '1', unit: 'szt', unitNetPrice: '50.00', vatRate: '8' }
    ]));

    expect(result.breakdown).toHaveLength(2);

    const row23 = result.breakdown.find((row) => row.vatRate === '23');
    const row8 = result.breakdown.find((row) => row.vatRate === '8');

    expect(row23).toMatchObject({ net: '300.00', vat: '69.00', gross: '369.00' });
    expect(row8).toMatchObject({ net: '50.00', vat: '4.00', gross: '54.00' });
  });

  it('handles fractional quantity and price', () => {
    const result = calculateInvoiceTotals(makeInvoice([
      { description: 'Partial', quantity: '1.5', unit: 'szt', unitNetPrice: '10.00', vatRate: '23' }
    ]));

    expect(result.totals.net).toBe('15.00');
    expect(result.totals.vat).toBe('3.45');
    expect(result.totals.gross).toBe('18.45');
  });

  it('supports negative line values for KOR corrections', () => {
    const result = calculateInvoiceTotals(makeInvoice([
      { description: 'Correction', quantity: '1', unit: 'szt', unitNetPrice: '-150.00', vatRate: '23' }
    ], {
      invoiceNumber: 'KOR 1/4/2026',
      invoiceType: 'KOR'
    }));

    expect(result.totals).toEqual({ net: '-150.00', vat: '-34.50', gross: '-184.50' });
    expect(result.lines[0]).toMatchObject({
      unitNetPrice: '-150.00',
      net: '-150.00',
      vat: '-34.50',
      gross: '-184.50'
    });
  });

  it('rounds negative VAT amounts symmetrically', () => {
    const result = calculateInvoiceTotals(makeInvoice([
      { description: 'Correction', quantity: '1', unit: 'szt', unitNetPrice: '-1.00', vatRate: '23' }
    ]));

    expect(result.totals).toEqual({ net: '-1.00', vat: '-0.23', gross: '-1.23' });
  });

  it('uses BigInt precision — avoids floating-point drift', () => {
    // 3 × 333.33 = 999.99 exactly; floating point would give 999.9899999...
    const result = calculateInvoiceTotals(makeInvoice([
      { description: 'Precision', quantity: '3', unit: 'szt', unitNetPrice: '333.33', vatRate: '0' }
    ]));

    expect(result.totals.net).toBe('999.99');
  });

  it('assigns correct lineNumber starting from 1', () => {
    const result = calculateInvoiceTotals(makeInvoice([
      { description: 'First', quantity: '1', unit: 'szt', unitNetPrice: '10.00', vatRate: '23' },
      { description: 'Second', quantity: '1', unit: 'szt', unitNetPrice: '20.00', vatRate: '23' }
    ]));

    expect(result.lines[0]!.lineNumber).toBe(1);
    expect(result.lines[1]!.lineNumber).toBe(2);
  });

  it('throws INVALID_INVOICE_DATA for empty lines array', () => {
    expect(() => calculateInvoiceTotals(makeInvoice([]))).toThrow(Fa3ContractError);
    expect(() => calculateInvoiceTotals(makeInvoice([]))).toThrow('at least one line');
  });

  it('throws INVALID_INVOICE_DATA for invalid decimal in quantity', () => {
    expect(() => calculateInvoiceTotals(makeInvoice([
      { description: 'Bad', quantity: 'abc', unit: 'szt', unitNetPrice: '10.00', vatRate: '23' }
    ]))).toThrow(Fa3ContractError);
  });
});

describe('assertInvoiceMathConsistency()', () => {
  it('does not throw when totals match', () => {
    const invoice = makeInvoice(
      [{ description: 'A', quantity: '1', unit: 'szt', unitNetPrice: '100.00', vatRate: '23' }],
      { totalNet: '100.00', totalVat: '23.00', totalGross: '123.00' }
    );

    expect(() => assertInvoiceMathConsistency(invoice)).not.toThrow();
  });

  it('throws with INVOICE_TOTALS_MISMATCH when totalNet is wrong', () => {
    const invoice = makeInvoice(
      [{ description: 'A', quantity: '1', unit: 'szt', unitNetPrice: '100.00', vatRate: '23' }],
      { totalNet: '99.00', totalVat: '23.00', totalGross: '123.00' }
    );

    expect(() => assertInvoiceMathConsistency(invoice)).toThrow('totalNet');
  });

  it('throws with INVOICE_TOTALS_MISMATCH when totalVat is wrong', () => {
    const invoice = makeInvoice(
      [{ description: 'A', quantity: '1', unit: 'szt', unitNetPrice: '100.00', vatRate: '23' }],
      { totalNet: '100.00', totalVat: '22.00', totalGross: '123.00' }
    );

    expect(() => assertInvoiceMathConsistency(invoice)).toThrow('totalVat');
  });

  it('throws with INVOICE_TOTALS_MISMATCH when totalGross is wrong', () => {
    const invoice = makeInvoice(
      [{ description: 'A', quantity: '1', unit: 'szt', unitNetPrice: '100.00', vatRate: '23' }],
      { totalNet: '100.00', totalVat: '23.00', totalGross: '120.00' }
    );

    expect(() => assertInvoiceMathConsistency(invoice)).toThrow('totalGross');
  });

  it('includes all mismatch fields in a single error when multiple totals are wrong', () => {
    const invoice = makeInvoice(
      [{ description: 'A', quantity: '1', unit: 'szt', unitNetPrice: '100.00', vatRate: '23' }],
      { totalNet: '1.00', totalVat: '1.00', totalGross: '1.00' }
    );

    let error: Error | null = null;
    try {
      assertInvoiceMathConsistency(invoice);
    } catch (caught) {
      error = caught as Error;
    }

    expect(error).not.toBeNull();
    expect(error!.message).toContain('totalNet');
    expect(error!.message).toContain('totalVat');
    expect(error!.message).toContain('totalGross');
  });
});

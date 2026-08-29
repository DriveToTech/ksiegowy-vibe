import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeInvestmentDecimal,
  validateInvestmentPositionForm,
  validateInvestmentTransactionForm,
} from './household-investment-validation';

test('normalizeInvestmentDecimal accepts Polish decimal input and preserves precision limits', () => {
  assert.equal(normalizeInvestmentDecimal('1\u00a0234,50', 2), '1234.50');
  assert.equal(normalizeInvestmentDecimal('0007.125', 3), '7.125');
  assert.equal(normalizeInvestmentDecimal('12,345', 2), null);
  assert.equal(normalizeInvestmentDecimal('-1', 2), null);
});

test('validateInvestmentPositionForm requires a named instrument and bounded target allocation', () => {
  assert.equal(validateInvestmentPositionForm({ instrument: 'ETF', targetAllocationPercent: '25,50' }), null);
  assert.match(validateInvestmentPositionForm({ instrument: '', targetAllocationPercent: '' }) ?? '', /nazwę instrumentu/i);
  assert.match(validateInvestmentPositionForm({ instrument: 'ETF', targetAllocationPercent: '100,01' }) ?? '', /alokację docelową/i);
});

test('validateInvestmentTransactionForm applies type-specific amount and unit rules', () => {
  const validBuy = {
    type: 'BUY' as const,
    amount: '1000,00',
    units: '2,5',
    date: '2026-08-29',
    operationId: 'broker-1',
  };

  assert.equal(validateInvestmentTransactionForm(validBuy), null);
  assert.equal(validateInvestmentTransactionForm({ ...validBuy, type: 'VALUATION_UPDATE', amount: '0', units: '' }), null);
  assert.match(validateInvestmentTransactionForm({ ...validBuy, type: 'SELL', units: '' }) ?? '', /liczbę jednostek/i);
  assert.match(validateInvestmentTransactionForm({ ...validBuy, type: 'CONTRIBUTION', units: '1' }) ?? '', /nie przyjmuje/i);
  assert.match(validateInvestmentTransactionForm({ ...validBuy, amount: '0' }) ?? '', /prawidłową kwotę/i);
});

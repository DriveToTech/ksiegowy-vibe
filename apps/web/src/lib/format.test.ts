import assert from 'node:assert/strict';
import test from 'node:test';

import { formatDate, formatMoney, formatPercentage, parseDecimalValue } from './format';

test('parseDecimalValue accepts Polish grouping spaces and decimal comma', () => {
  assert.equal(parseDecimalValue('1 234,56'), 1234.56);
  assert.equal(parseDecimalValue('1\u00a0234,56'), 1234.56);
  assert.equal(parseDecimalValue('1\u202f234,56'), 1234.56);
});

test('parseDecimalValue rejects malformed non-empty input', () => {
  assert.equal(parseDecimalValue('12,34,56'), null);
  assert.equal(parseDecimalValue('12 zł'), null);
  assert.equal(parseDecimalValue(''), null);
});

test('formatters use Polish decimal separators and preserve calendar dates', () => {
  assert.equal(formatMoney('1\u00a0234,56').replace(/\u00a0/g, ' '), '1234,56 zł');
  assert.equal(formatPercentage('7.4'), '7,4%');
  assert.equal(formatDate('2026-08-01T00:00:00.000Z'), '01.08.2026');
});

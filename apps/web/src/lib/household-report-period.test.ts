import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHouseholdReportExportQuery,
  buildHouseholdReportQuery,
  parseHouseholdReportPeriod,
  validateHouseholdReportDateRange,
} from './household-report-period';

test('parseHouseholdReportPeriod resolves presets and inclusive bounded ranges', () => {
  const now = new Date('2026-08-29T12:00:00.000Z');
  assert.deepEqual(parseHouseholdReportPeriod({}, now).period, {
    preset: 'year-to-date',
    from: '2026-01-01',
    to: '2026-08-29',
  });
  assert.deepEqual(parseHouseholdReportPeriod({ preset: 'last-12-months' }, now).period, {
    preset: 'last-12-months',
    from: '2025-08-30',
    to: '2026-08-29',
  });
  assert.deepEqual(parseHouseholdReportPeriod({ preset: 'custom', from: '2026-01-01', to: '2026-01-31' }, now).period, {
    preset: 'custom',
    from: '2026-01-01',
    to: '2026-01-31',
  });
  assert.equal(validateHouseholdReportDateRange('2025-01-01', '2026-01-01'), 'RANGE_TOO_LONG');
  assert.equal(validateHouseholdReportDateRange('2026-02-30', '2026-03-01'), 'INVALID_DATE');
});

test('report query builders keep custom dates and reject invalid export ranges', () => {
  assert.equal(buildHouseholdReportQuery({ preset: 'custom', from: '2026-01-01', to: '2026-01-31' }), 'preset=custom&from=2026-01-01&to=2026-01-31');
  assert.equal(buildHouseholdReportExportQuery('2026-01-01', '2026-01-31', 'csv'), 'from=2026-01-01&to=2026-01-31&format=csv');
  assert.throws(() => buildHouseholdReportExportQuery('2026-01-01', '2027-01-01', 'pdf'), /valid inclusive date range/i);
});

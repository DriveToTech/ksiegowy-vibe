import assert from 'node:assert/strict';
import test from 'node:test';

import { getHouseholdGoalForecast } from './household-goal-forecast';

const fixedRule = { ruleType: 'FIXED_ON_DAY' as const, startsOn: '2026-08-01' };

test('goal forecast hides dates when lifecycle or fixed rule schedule makes them unreliable', () => {
  assert.deepEqual(getHouseholdGoalForecast({ status: 'ACTIVE', activeRules: [fixedRule] }, '2027-01-01', '2026-08-29'), {
    state: 'AVAILABLE',
    forecastDate: '2027-01-01',
  });
  assert.deepEqual(getHouseholdGoalForecast({ status: 'ACTIVE', activeRules: [{ ...fixedRule, startsOn: '2026-09-01' }] }, '2027-01-01', '2026-08-29'), {
    state: 'FUTURE_FIXED_RULE',
    forecastDate: null,
  });
  assert.deepEqual(getHouseholdGoalForecast({ status: 'PAUSED', activeRules: [fixedRule] }, '2027-01-01', '2026-08-29'), {
    state: 'PAUSED',
    forecastDate: null,
  });
  assert.deepEqual(getHouseholdGoalForecast({ status: 'ARCHIVED', activeRules: [fixedRule] }, '2027-01-01', '2026-08-29'), {
    state: 'ARCHIVED',
    forecastDate: null,
  });
  assert.deepEqual(getHouseholdGoalForecast({ status: 'COMPLETED', activeRules: [fixedRule] }, '2027-01-01', '2026-08-29'), {
    state: 'COMPLETED',
    forecastDate: null,
  });
});

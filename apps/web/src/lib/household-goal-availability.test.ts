import assert from 'node:assert/strict';
import test from 'node:test';

import { getHouseholdGoalActionAvailability } from './household-goal-availability';

test('goal action availability follows backend lifecycle semantics', () => {
  assert.deepEqual(getHouseholdGoalActionAvailability({ status: 'ACTIVE', currentAmount: '100.00' }), {
    canAdd: true,
    canWithdraw: true,
    canManageRules: true,
  });
  assert.deepEqual(getHouseholdGoalActionAvailability({ status: 'PAUSED', currentAmount: '100.00' }), {
    canAdd: true,
    canWithdraw: true,
    canManageRules: true,
  });
  assert.deepEqual(getHouseholdGoalActionAvailability({ status: 'COMPLETED', currentAmount: '100.00' }), {
    canAdd: false,
    canWithdraw: true,
    canManageRules: false,
  });
  assert.deepEqual(getHouseholdGoalActionAvailability({ status: 'ARCHIVED', currentAmount: '100.00' }), {
    canAdd: false,
    canWithdraw: false,
    canManageRules: false,
  });
  assert.equal(getHouseholdGoalActionAvailability({ status: 'ACTIVE', currentAmount: '0.00' }).canWithdraw, false);
});

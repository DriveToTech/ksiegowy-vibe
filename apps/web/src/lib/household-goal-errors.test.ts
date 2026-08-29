import assert from 'node:assert/strict';
import test from 'node:test';

import { householdGoalErrorMessage } from './household-goal-errors';

test('goal errors expose stable safe messages instead of backend details', () => {
  assert.equal(householdGoalErrorMessage(409, 'SOURCE_ACCOUNT_FUNDS_INSUFFICIENT'), 'Na wybranym koncie nie ma wystarczających środków.');
  assert.equal(householdGoalErrorMessage(500, 'UNKNOWN_PRIVATE_CODE'), 'Cele są chwilowo niedostępne. Spróbuj ponownie później.');
  assert.doesNotMatch(householdGoalErrorMessage(400, 'UNKNOWN_PRIVATE_CODE'), /UNKNOWN_PRIVATE_CODE/);
});

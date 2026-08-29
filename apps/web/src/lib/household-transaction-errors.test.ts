import assert from 'node:assert/strict';
import test from 'node:test';

import { householdTransactionErrorMessage } from './household-transaction-errors';

test('transaction errors expose stable safe messages for immutable goal entries', () => {
  assert.equal(householdTransactionErrorMessage(409, 'TRANSACTION_IMMUTABLE'), 'Ta płatność jest powiązana z celem i nie można jej zmieniać ani usuwać.');
  assert.equal(householdTransactionErrorMessage(409, 'PRIVATE_BACKEND_MESSAGE'), 'Nie udało się wykonać operacji na płatności.');
  assert.equal(householdTransactionErrorMessage(500, 'PRIVATE_BACKEND_MESSAGE'), 'Płatności są chwilowo niedostępne. Spróbuj ponownie później.');
});

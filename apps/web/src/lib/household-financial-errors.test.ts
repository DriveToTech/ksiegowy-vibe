import assert from 'node:assert/strict';
import test from 'node:test';

import { householdInvestmentErrorMessage, householdReportErrorMessage } from './household-financial-errors';

test('financial errors map stable backend codes without exposing unknown details', () => {
  assert.equal(householdInvestmentErrorMessage(409, 'SELL_UNITS_INSUFFICIENT'), 'Liczba sprzedawanych jednostek przekracza dostępne jednostki.');
  assert.equal(householdInvestmentErrorMessage(500, 'PRIVATE_BACKEND_DETAIL'), 'Inwestycje są chwilowo niedostępne. Spróbuj ponownie później.');
  assert.doesNotMatch(householdReportErrorMessage(400, 'PRIVATE_BACKEND_DETAIL'), /PRIVATE_BACKEND_DETAIL/);
  assert.equal(householdReportErrorMessage(400, 'REPORT_PERIOD_INVALID'), 'Podaj prawidłowy zakres dat raportu.');
});

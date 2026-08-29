const investmentErrorMessages: Record<string, string> = {
  INVESTMENT_NOT_FOUND: 'Nie znaleziono pozycji inwestycyjnej lub nie masz do niej dostępu.',
  INVESTMENT_TRANSACTION_NOT_FOUND: 'Nie znaleziono operacji inwestycyjnej lub nie masz do niej dostępu.',
  INVESTMENT_OWNER_REQUIRED: 'Tylko właściciel pozycji może ją zmieniać lub rejestrować jej operacje.',
  INVESTMENT_INVALID_STATE: 'Ta operacja nie jest teraz dostępna dla tej pozycji.',
  INVESTMENT_UNITS_INSUFFICIENT: 'Liczba sprzedawanych jednostek przekracza dostępne jednostki.',
  SELL_UNITS_INSUFFICIENT: 'Liczba sprzedawanych jednostek przekracza dostępne jednostki.',
  IDEMPOTENCY_CONFLICT: 'Identyfikator operacji został już użyty z innymi danymi.',
  WORKLOAD_LIMIT_EXCEEDED: 'Zakres danych inwestycyjnych jest zbyt duży. Zawęź zakres i spróbuj ponownie.',
  VALIDATION_ERROR: 'Sprawdź wprowadzone dane inwestycji.',
};

const reportErrorMessages: Record<string, string> = {
  REPORT_PERIOD_INVALID: 'Podaj prawidłowy zakres dat raportu.',
  VALIDATION_ERROR: 'Podaj prawidłowy zakres dat raportu.',
  WORKLOAD_LIMIT_EXCEEDED: 'Zakres raportu jest zbyt duży. Wybierz krótszy okres i spróbuj ponownie.',
};

function fallbackFinancialError(statusCode: number, unavailableMessage: string, forbiddenMessage: string): string {
  if (statusCode === 401) return 'Sesja wygasła. Zaloguj się ponownie.';
  if (statusCode === 403) return forbiddenMessage;
  if (statusCode === 404) return 'Nie znaleziono danych lub nie masz do nich dostępu.';
  if (statusCode >= 500) return unavailableMessage;
  return 'Nie udało się wykonać operacji. Sprawdź dane i spróbuj ponownie.';
}

export function householdInvestmentErrorMessage(statusCode: number, code?: string): string {
  if (code && investmentErrorMessages[code]) return investmentErrorMessages[code];
  return fallbackFinancialError(statusCode, 'Inwestycje są chwilowo niedostępne. Spróbuj ponownie później.', 'Nie masz dostępu do tych inwestycji.');
}

export function householdReportErrorMessage(statusCode: number, code?: string): string {
  if (code && reportErrorMessages[code]) return reportErrorMessages[code];
  return fallbackFinancialError(statusCode, 'Raporty są chwilowo niedostępne. Spróbuj ponownie później.', 'Nie masz dostępu do tego raportu.');
}

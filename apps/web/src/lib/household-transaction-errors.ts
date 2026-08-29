const householdTransactionErrorMessages: Record<string, string> = {
  TRANSACTION_IMMUTABLE: 'Ta płatność jest powiązana z celem i nie można jej zmieniać ani usuwać.',
  TRANSACTION_NOT_FOUND: 'Nie znaleziono płatności lub nie masz do niej dostępu.',
  ACCOUNT_NOT_FOUND: 'Wybrane konto nie jest dostępne.',
  VALIDATION_ERROR: 'Sprawdź wprowadzone dane płatności.',
};

export function householdTransactionErrorMessage(statusCode: number, code?: string): string {
  if (code && householdTransactionErrorMessages[code]) return householdTransactionErrorMessages[code];
  if (statusCode === 401) return 'Sesja wygasła. Zaloguj się ponownie.';
  if (statusCode === 403) return 'Nie masz dostępu do tej płatności.';
  if (statusCode === 404) return 'Nie znaleziono płatności lub nie masz do niej dostępu.';
  if (statusCode >= 500) return 'Płatności są chwilowo niedostępne. Spróbuj ponownie później.';
  return 'Nie udało się wykonać operacji na płatności.';
}

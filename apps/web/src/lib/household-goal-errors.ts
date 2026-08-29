const goalErrorMessages: Record<string, string> = {
  GOAL_NOT_FOUND: 'Nie znaleziono celu lub nie masz do niego dostępu.',
  ACCOUNT_NOT_FOUND: 'Wybrane konto nie jest dostępne.',
  VALIDATION_ERROR: 'Sprawdź wprowadzone dane.',
  GOAL_INVALID_STATE: 'Ta operacja nie jest teraz dostępna dla tego celu.',
  GOAL_TARGET_EXCEEDED: 'Kwota przekracza pozostałą wartość celu.',
  GOAL_BALANCE_INSUFFICIENT: 'Saldo celu jest niewystarczające.',
  SOURCE_ACCOUNT_FUNDS_INSUFFICIENT: 'Na wybranym koncie nie ma wystarczających środków.',
  GOAL_RULE_CONFLICT: 'Taka aktywna reguła już istnieje.',
  IDEMPOTENCY_CONFLICT: 'Operacja została już użyta z innymi danymi.',
};

export function householdGoalErrorMessage(statusCode: number, code?: string): string {
  if (code && goalErrorMessages[code]) return goalErrorMessages[code];
  if (statusCode === 401) return 'Sesja wygasła. Zaloguj się ponownie.';
  if (statusCode === 403) return 'Nie masz dostępu do tego celu.';
  if (statusCode === 404) return 'Nie znaleziono celu lub nie masz do niego dostępu.';
  if (statusCode >= 500) return 'Cele są chwilowo niedostępne. Spróbuj ponownie później.';
  return 'Nie udało się wykonać operacji na celu.';
}

import type { HouseholdInvestmentTransactionType } from './api-types';

export function normalizeInvestmentDecimal(value: string, maximumFractionDigits: number): string | null {
  const normalizedValue = value.trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!normalizedValue || !/^\d+(?:\.\d+)?$/.test(normalizedValue)) return null;

  const [integerPart = '', fractionPart] = normalizedValue.split('.');
  if (fractionPart !== undefined && fractionPart.length > maximumFractionDigits) return null;
  const normalizedIntegerPart = integerPart.replace(/^0+(?=\d)/, '') || '0';
  return fractionPart === undefined ? normalizedIntegerPart : `${normalizedIntegerPart}.${fractionPart}`;
}

export function validateInvestmentPositionForm(input: {
  instrument: string;
  targetAllocationPercent: string;
}): string | null {
  if (!input.instrument.trim()) return 'Podaj nazwę instrumentu.';
  if (input.targetAllocationPercent.trim()) {
    const targetAllocationPercent = normalizeInvestmentDecimal(input.targetAllocationPercent, 2);
    if (targetAllocationPercent === null || Number(targetAllocationPercent) > 100) return 'Podaj alokację docelową od 0 do 100%.';
  }
  return null;
}

export function validateInvestmentTransactionForm(input: {
  type: HouseholdInvestmentTransactionType;
  amount: string;
  units: string;
  date: string;
  operationId: string;
}): string | null {
  const amount = normalizeInvestmentDecimal(input.amount, 2);
  if (amount === null || (input.type !== 'VALUATION_UPDATE' && Number(amount) <= 0)) return 'Podaj prawidłową kwotę operacji.';
  if (!input.date) return 'Podaj datę operacji.';
  if (!input.operationId.trim()) return 'Podaj identyfikator operacji.';

  const requiresUnits = input.type === 'BUY' || input.type === 'SELL';
  const hasUnits = input.units.trim().length > 0;
  if (requiresUnits && !hasUnits) return 'Podaj liczbę jednostek.';
  if (!requiresUnits && hasUnits) return 'Ta operacja nie przyjmuje liczby jednostek.';
  if (requiresUnits) {
    const units = normalizeInvestmentDecimal(input.units, 8);
    if (units === null || Number(units) <= 0) return 'Podaj dodatnią liczbę jednostek.';
  }
  return null;
}

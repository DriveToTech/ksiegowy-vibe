import type { CommitmentType } from './api-types';
import { parseDecimalValue } from './format';
import { t } from './translations';

interface CommitmentFormValidationInput {
  type: CommitmentType;
  name: string;
  accountId: string;
  amount: string;
  nextDueDate: string;
  provider: string;
  termMonths: string;
}

export function validateCommitmentForm(input: CommitmentFormValidationInput): string | null {
  if (!input.name.trim()) return t.household.commitmentForm.nameRequiredError;
  if (!input.accountId) return t.household.commitmentForm.accountRequiredError;
  if (input.type === 'INSURANCE' && !input.provider.trim()) return t.household.commitmentForm.providerRequiredError;

  const amount = parseDecimalValue(input.amount);
  if (amount === null || amount <= 0) return t.household.commitmentForm.amountRequiredError;
  if (!input.nextDueDate) return t.household.commitmentForm.dateRequiredError;

  if (input.type === 'LOAN') {
    const termMonths = Number(input.termMonths);
    if (!input.termMonths.trim() || !Number.isInteger(termMonths) || termMonths <= 0) {
      return t.household.commitmentForm.termMonthsRequiredError;
    }
  }

  return null;
}

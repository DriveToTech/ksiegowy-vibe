import type { CommitmentType, HouseholdGoalAutomationRuleType, HouseholdGoalKind } from './api-types';
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

interface GoalFormValidationInput {
  kind: HouseholdGoalKind;
  name: string;
  accountId: string;
  targetAmount: string;
  targetDate: string;
  monthlyAmount: string;
}

export function validateGoalForm(input: GoalFormValidationInput): string | null {
  if (!input.name.trim()) return t.household.goals.nameRequiredError;
  if (!input.accountId) return t.household.goals.accountRequiredError;

  const targetAmount = parseDecimalValue(input.targetAmount);
  if (input.kind !== 'NO_CEILING' && (targetAmount === null || targetAmount <= 0)) {
    return t.household.goals.targetAmountRequiredError;
  }

  if (input.kind === 'ONE_OFF') {
    const hasTargetDate = Boolean(input.targetDate);
    const hasMonthlyAmount = Boolean(input.monthlyAmount.trim());
    if (hasTargetDate === hasMonthlyAmount) return t.household.goals.targetDateOrMonthlyRequiredError;
    if (hasMonthlyAmount) {
      const monthlyAmount = parseDecimalValue(input.monthlyAmount);
      if (monthlyAmount === null || monthlyAmount <= 0) return t.household.goals.monthlyAmountRequiredError;
    }
    return null;
  }

  if (input.kind === 'ONGOING' && input.targetDate) return t.household.goals.targetDateForbiddenError;
  if (input.kind === 'NO_CEILING' && input.targetAmount.trim()) return t.household.goals.targetAmountForbiddenError;

  const monthlyAmount = parseDecimalValue(input.monthlyAmount);
  if (monthlyAmount === null || monthlyAmount <= 0) return t.household.goals.monthlyAmountRequiredError;
  return null;
}

interface GoalAutomationRuleValidationInput {
  ruleType: HouseholdGoalAutomationRuleType;
  fundingAccountId: string;
  goalAccountId: string;
  triggerAccountId: string;
  startsOn: string;
  fixedAmount: string;
  dayOfMonth: string;
  percentage: string;
  incomeThreshold: string;
  roundUpToAmount: string;
}

export function validateGoalAutomationRuleForm(input: GoalAutomationRuleValidationInput): string | null {
  if (!input.fundingAccountId || input.fundingAccountId === input.goalAccountId) {
    return t.household.goals.rules.validation.fundingAccountRequired;
  }
  if (!input.startsOn) return t.household.goals.rules.validation.startsOnRequired;

  if (input.ruleType === 'FIXED_ON_DAY') {
    const fixedAmount = parseDecimalValue(input.fixedAmount);
    const dayOfMonth = Number(input.dayOfMonth);
    if (fixedAmount === null || fixedAmount <= 0) return t.household.goals.rules.validation.fixedAmountRequired;
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28) return t.household.goals.rules.validation.dayOfMonthRequired;
    return null;
  }

  if (!input.triggerAccountId) return t.household.goals.rules.validation.triggerAccountRequired;

  if (input.ruleType === 'PERCENT_OF_INCOME_OVER_THRESHOLD') {
    const percentage = parseDecimalValue(input.percentage);
    const incomeThreshold = parseDecimalValue(input.incomeThreshold);
    if (percentage === null || percentage <= 0 || percentage > 100) return t.household.goals.rules.validation.percentageRequired;
    if (incomeThreshold === null || incomeThreshold < 0) return t.household.goals.rules.validation.incomeThresholdRequired;
    return null;
  }

  const roundUpToAmount = parseDecimalValue(input.roundUpToAmount);
  return roundUpToAmount === null || roundUpToAmount <= 0
    ? t.household.goals.rules.validation.roundUpToAmountRequired
    : null;
}

import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCommitmentForm, validateGoalAutomationRuleForm, validateGoalForm } from './household-validation';

const validCommitment = {
  type: 'INSURANCE' as const,
  name: 'Ubezpieczenie domu',
  accountId: 'account-1',
  amount: '120,00',
  nextDueDate: '2026-08-28',
  provider: 'Ubezpieczyciel',
  termMonths: '',
};

test('validateCommitmentForm requires insurer, account, amount, and date', () => {
  assert.match(validateCommitmentForm({ ...validCommitment, provider: '' }) ?? '', /ubezpieczyciela/i);
  assert.match(validateCommitmentForm({ ...validCommitment, accountId: '' }) ?? '', /konto płatnicze/i);
  assert.match(validateCommitmentForm({ ...validCommitment, amount: '' }) ?? '', /kwotę/i);
  assert.match(validateCommitmentForm({ ...validCommitment, nextDueDate: '' }) ?? '', /termin/i);
});

test('validateCommitmentForm requires a positive whole loan term', () => {
  assert.match(validateCommitmentForm({ ...validCommitment, type: 'LOAN', termMonths: '0' }) ?? '', /dodatni okres/i);
  assert.match(validateCommitmentForm({ ...validCommitment, type: 'LOAN', termMonths: '12.5' }) ?? '', /dodatni okres/i);
  assert.equal(validateCommitmentForm({ ...validCommitment, type: 'LOAN', termMonths: '12', provider: '' }), null);
});

const validGoal = {
  kind: 'ONE_OFF' as const,
  name: 'Poduszka finansowa',
  accountId: 'account-1',
  targetAmount: '12000',
  targetDate: '2027-08-01',
  monthlyAmount: '',
};

test('validateGoalForm enforces the backend goal shape', () => {
  assert.equal(validateGoalForm(validGoal), null);
  assert.match(validateGoalForm({ ...validGoal, targetAmount: '' }) ?? '', /kwotę docelową/i);
  assert.match(validateGoalForm({ ...validGoal, targetDate: '', monthlyAmount: '' }) ?? '', /termin albo dodatnią/i);
  assert.match(validateGoalForm({ ...validGoal, targetDate: '2027-08-01', monthlyAmount: '500' }) ?? '', /termin albo dodatnią/i);
  assert.match(validateGoalForm({ ...validGoal, kind: 'NO_CEILING', targetAmount: '100', targetDate: '' }) ?? '', /nie obsługuje kwoty/i);
  assert.equal(validateGoalForm({ ...validGoal, kind: 'NO_CEILING', targetAmount: '', targetDate: '', monthlyAmount: '500' }), null);
});

test('validateGoalAutomationRuleForm validates fixed, percentage, and round-up rules', () => {
  const fixedRule = {
    ruleType: 'FIXED_ON_DAY' as const,
    fundingAccountId: 'account-2',
    goalAccountId: 'account-1',
    triggerAccountId: '',
    startsOn: '2026-09-01',
    fixedAmount: '250',
    dayOfMonth: '15',
    percentage: '',
    incomeThreshold: '',
    roundUpToAmount: '',
  };
  assert.equal(validateGoalAutomationRuleForm(fixedRule), null);
  assert.match(validateGoalAutomationRuleForm({ ...fixedRule, dayOfMonth: '29' }) ?? '', /od 1 do 28/i);
  assert.equal(validateGoalAutomationRuleForm({ ...fixedRule, ruleType: 'PERCENT_OF_INCOME_OVER_THRESHOLD', triggerAccountId: 'account-3', fixedAmount: '', dayOfMonth: '', percentage: '10,5', incomeThreshold: '5000' }), null);
  assert.equal(validateGoalAutomationRuleForm({ ...fixedRule, ruleType: 'ROUND_UP', triggerAccountId: 'account-3', fixedAmount: '', dayOfMonth: '', roundUpToAmount: '10' }), null);
});

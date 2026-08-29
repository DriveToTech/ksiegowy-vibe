import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCommitmentForm } from './household-validation';

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

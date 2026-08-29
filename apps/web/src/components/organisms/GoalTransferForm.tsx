'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { HouseholdAccount, HouseholdGoal } from '../../lib/api-types';
import { createHouseholdGoalMovement } from '../../lib/api-client';
import { formatDate, formatMoney, parseDecimalValue, todayAsCalendarDate } from '../../lib/format';
import { getHouseholdGoalActionAvailability } from '../../lib/household-goal-availability';
import { t } from '../../lib/translations';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { Surface } from '../atoms/Surface';
import { Textarea } from '../atoms/Textarea';
import { AccountPicker } from '../molecules/AccountPicker';
import { Banner } from '../molecules/Banner';
import { ErrorState } from '../molecules/ErrorState';
import { FormField } from '../molecules/FormField';

interface GoalTransferFormProps {
  householdId: string;
  goal: HouseholdGoal;
  accounts: HouseholdAccount[];
  direction: 'ADD' | 'WITHDRAW';
}

export function GoalTransferForm({ householdId, goal, accounts, direction }: GoalTransferFormProps) {
  const router = useRouter();
  const isAdd = direction === 'ADD';
  const actionAvailability = getHouseholdGoalActionAvailability(goal);
  const counterpartyAccounts = accounts.filter((account) => account.id !== goal.accountId && account.type !== 'CREDIT_CARD');
  const goalAccount = accounts.find((account) => account.id === goal.accountId) ?? null;
  const [accountId, setAccountId] = useState(counterpartyAccounts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(todayAsCalendarDate());
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [operation, setOperation] = useState<{ fingerprint: string; id: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAccount = counterpartyAccounts.find((account) => account.id === accountId) ?? null;
  const hasSameAccount = accountId === goal.accountId;
  const sourceName = isAdd ? selectedAccount?.name ?? '—' : goalAccount?.name ?? '—';
  const destinationName = isAdd ? goalAccount?.name ?? '—' : selectedAccount?.name ?? '—';

  const actionUnavailableMessage = isAdd
    ? actionAvailability.canAdd ? null : goal.status === 'ARCHIVED'
      ? t.household.goals.actions.archived
      : t.household.goals.actions.completedAddUnavailable
    : actionAvailability.canWithdraw ? null : goal.status === 'ARCHIVED'
      ? t.household.goals.actions.archived
      : t.household.goals.actions.withdrawUnavailable;

  const resetTransferConfirmation = () => {
    setConfirmed(false);
    setOperation(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsedAmount = parseDecimalValue(amount);
    if (parsedAmount === null || parsedAmount <= 0) {
      setError(t.household.goals.transfer.amountRequiredError);
      return;
    }
    if (!accountId || !selectedAccount || hasSameAccount) {
      setError(t.household.goals.transfer.accountRequiredError);
      return;
    }
    if (!effectiveDate) {
      setError(t.household.goals.transfer.dateRequiredError);
      return;
    }
    if (!confirmed) {
      setError(t.household.goals.transfer.confirmationRequiredError);
      return;
    }

    const transferFingerprint = JSON.stringify([accountId, direction, parsedAmount.toFixed(2), effectiveDate, note.trim()]);
    const nextOperation = operation?.fingerprint === transferFingerprint
      ? operation
      : { fingerprint: transferFingerprint, id: window.crypto.randomUUID() };
    if (nextOperation !== operation) setConfirmed(false);
    setOperation(nextOperation);
    setSubmitting(true);
    const result = await createHouseholdGoalMovement(householdId, goal.id, {
      accountId,
      direction,
      amount: parsedAmount.toFixed(2),
      effectiveDate,
      operationId: nextOperation.id,
      note: note.trim() || undefined,
    }).catch((submitError: Error) => submitError);
    setSubmitting(false);

    if (result instanceof Error) {
      setError(result.message);
      return;
    }

    router.push(`/household/goals/${goal.id}`);
    router.refresh();
  };

  if (actionUnavailableMessage) {
    return (
      <Surface className="space-y-4 p-5 sm:p-6">
        <ErrorState title={isAdd ? t.household.goals.transfer.addUnavailableTitle : t.household.goals.transfer.withdrawUnavailableTitle} message={actionUnavailableMessage} />
        <Button href={`/household/goals/${goal.id}`} variant="secondary">{t.household.goals.transfer.cancel}</Button>
      </Surface>
    );
  }

  if (counterpartyAccounts.length === 0) {
    return (
      <Surface className="space-y-4 p-5 sm:p-6">
        <ErrorState title={t.household.goals.transfer.noCounterpartyTitle} message={t.household.goals.transfer.noCounterpartyDescription} />
        <Button href="/household/settings/accounts" variant="secondary">{t.household.settings.accountsPageTitle}</Button>
      </Surface>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? <ErrorState message={error} /> : null}
      {goal.status === 'PAUSED' ? <Banner tone="warning" role="status">{t.household.goals.actions.paused}</Banner> : null}

      <Surface className="space-y-4 p-5 sm:p-6">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">{t.household.goals.transfer.summaryTitle}</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <AccountSummary label={isAdd ? t.household.goals.transfer.sourceAccount : t.household.goals.transfer.goalAccount} name={sourceName} />
          <span className="text-center text-lg text-primary" aria-hidden="true">{t.household.goals.transfer.summaryArrow}</span>
          <AccountSummary label={isAdd ? t.household.goals.transfer.goalAccount : t.household.goals.transfer.destinationAccount} name={destinationName} />
        </div>
        <div role="group" className="grid gap-3 sm:grid-cols-2" aria-label={t.household.goals.transfer.finalPayload}>
          <AccountSummary label={t.household.goals.transfer.amount} name={parseDecimalValue(amount) === null ? amount || '—' : formatMoney(parseDecimalValue(amount) ?? 0)} />
          <AccountSummary label={t.household.goals.transfer.date} name={formatDate(effectiveDate)} />
        </div>
        <p className="text-sm text-muted">{t.household.goals.transfer.sameAccountHint}</p>
      </Surface>

      <Surface className="space-y-5 p-5 sm:p-6">
        <FormField label={isAdd ? t.household.goals.transfer.sourceAccount : t.household.goals.transfer.destinationAccount} required>
          <AccountPicker accounts={counterpartyAccounts} value={accountId} onChange={(nextAccountId) => { setAccountId(nextAccountId); resetTransferConfirmation(); }} ariaLabel={isAdd ? t.household.goals.transfer.sourceAccount : t.household.goals.transfer.destinationAccount} />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={t.household.goals.transfer.amount} required>
            <Input value={amount} onChange={(event) => { setAmount(event.target.value); resetTransferConfirmation(); }} inputMode="decimal" placeholder="0,00" />
          </FormField>
          <FormField label={t.household.goals.transfer.date} required>
            <Input type="date" value={effectiveDate} onChange={(event) => { setEffectiveDate(event.target.value); resetTransferConfirmation(); }} />
          </FormField>
        </div>
        <FormField label={t.household.goals.transfer.note} hint={t.household.goals.transfer.notePlaceholder}>
          <Textarea value={note} onChange={(event) => { setNote(event.target.value); resetTransferConfirmation(); }} placeholder={t.household.goals.transfer.notePlaceholder} rows={3} />
        </FormField>
        <label className="flex min-h-11 items-center gap-3 rounded-inset bg-surface-raised px-4 py-3 text-sm text-foreground-secondary">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="h-4 w-4 rounded border-outline-control" />
          <span>{t.household.goals.transfer.confirmation}</span>
        </label>
      </Surface>

      <div className="flex flex-wrap justify-end gap-3">
        <Button href={`/household/goals/${goal.id}`} variant="secondary">{t.household.goals.transfer.cancel}</Button>
        <Button type="submit" disabled={submitting || hasSameAccount || !confirmed}>
          {submitting ? t.household.goals.transfer.saving : t.household.goals.transfer.save}
        </Button>
      </div>
    </form>
  );
}

function AccountSummary({ label, name }: { label: string; name: string }) {
  return (
    <div className="min-w-0 rounded-inset border border-outline bg-surface-raised p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">{name}</p>
    </div>
  );
}

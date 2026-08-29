'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { HouseholdAccount, HouseholdGoal, HouseholdGoalKind } from '../../lib/api-types';
import { createHouseholdGoal, updateHouseholdGoal } from '../../lib/api-client';
import { parseDecimalValue } from '../../lib/format';
import { validateGoalForm } from '../../lib/household-validation';
import { t } from '../../lib/translations';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { Surface } from '../atoms/Surface';
import { Textarea } from '../atoms/Textarea';
import { AccountPicker } from '../molecules/AccountPicker';
import { ErrorState } from '../molecules/ErrorState';
import { FormField } from '../molecules/FormField';
import { cn } from '../../lib/cn';

const GOAL_KINDS: HouseholdGoalKind[] = ['ONE_OFF', 'ONGOING', 'NO_CEILING'];
type OneOffPlanMode = 'date' | 'monthly';

interface GoalFormProps {
  householdId: string;
  accounts: HouseholdAccount[];
  goal?: HouseholdGoal;
  movementCount?: number;
}

export function GoalForm({ householdId, accounts, goal, movementCount = 0 }: GoalFormProps) {
  const router = useRouter();
  const eligibleAccounts = accounts.filter((account) => account.type !== 'CREDIT_CARD');
  const [name, setName] = useState(goal?.name ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [accountId, setAccountId] = useState(goal?.accountId ?? eligibleAccounts[0]?.id ?? '');
  const [kind, setKind] = useState<HouseholdGoalKind>(goal?.kind ?? 'ONE_OFF');
  const [targetAmount, setTargetAmount] = useState(goal?.targetAmount ?? '');
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '');
  const [monthlyAmount, setMonthlyAmount] = useState(goal?.monthlyAmount ?? '');
  const [planMode, setPlanMode] = useState<OneOffPlanMode>(goal?.targetDate ? 'date' : 'monthly');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAccount = eligibleAccounts.find((account) => account.id === accountId) ?? null;
  const accountAndKindLocked = movementCount > 0;

  const selectKind = (selectedKind: HouseholdGoalKind) => {
    if (accountAndKindLocked) return;
    setKind(selectedKind);
    if (selectedKind === 'NO_CEILING') setTargetAmount('');
    if (selectedKind !== 'ONE_OFF') {
      setTargetDate('');
      setPlanMode('monthly');
    }
  };

  const selectPlanMode = (selectedPlanMode: OneOffPlanMode) => {
    setPlanMode(selectedPlanMode);
    if (selectedPlanMode === 'date') setMonthlyAmount('');
    else setTargetDate('');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const validationError = validateGoalForm({ kind, name, accountId, targetAmount, targetDate, monthlyAmount });
    if (validationError) {
      setError(validationError);
      return;
    }

    const normalizedTargetAmount = kind === 'NO_CEILING' ? null : parseDecimalValue(targetAmount)?.toFixed(2) ?? null;
    const normalizedMonthlyAmount = parseDecimalValue(monthlyAmount)?.toFixed(2) ?? null;
    const normalizedTargetDate = kind === 'ONE_OFF' && planMode === 'date' ? targetDate : null;

    setSubmitting(true);
    if (goal) {
      const result = await updateHouseholdGoal(householdId, goal.id, {
        accountId,
        name: name.trim(),
        description: description.trim() || null,
        kind,
        targetAmount: normalizedTargetAmount,
        targetDate: normalizedTargetDate,
        monthlyAmount: normalizedMonthlyAmount,
      }).catch((submitError: Error) => submitError);
      setSubmitting(false);

      if (result instanceof Error) {
        setError(result.message);
        return;
      }

      router.push(`/household/goals/${goal.id}`);
      router.refresh();
      return;
    }

    const result = await createHouseholdGoal(householdId, {
      accountId,
      name: name.trim(),
      description: description.trim() || undefined,
      kind,
      ...(normalizedTargetAmount ? { targetAmount: normalizedTargetAmount } : {}),
      ...(normalizedTargetDate ? { targetDate: normalizedTargetDate } : {}),
      ...(normalizedMonthlyAmount ? { monthlyAmount: normalizedMonthlyAmount } : {}),
    }).catch((submitError: Error) => submitError);
    setSubmitting(false);

    if (result instanceof Error) {
      setError(result.message);
      return;
    }

    router.push(`/household/goals/${result.id}`);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? <ErrorState message={error} /> : null}

      <Surface className="space-y-5 p-5 sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={t.household.goals.fields.name} required>
            <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" />
          </FormField>
          <FormField label={t.household.goals.fields.account} required hint={t.household.goals.accountVisibilityHint}>
            <AccountPicker accounts={eligibleAccounts} value={accountId} onChange={setAccountId} disabled={accountAndKindLocked} ariaLabel={t.household.goals.fields.account} />
          </FormField>
        </div>

        {selectedAccount ? (
          <div className="flex flex-wrap items-center gap-2 rounded-inset bg-surface-raised px-4 py-3 text-sm text-muted">
            <span>{t.household.goals.accountLabel}: <strong className="text-foreground">{selectedAccount.name}</strong></span>
            <Badge tone={selectedAccount.visibility === 'PRIVATE' ? 'warning' : 'success'}>
              {t.household.goals.visibilityLabels[selectedAccount.visibility]}
            </Badge>
          </div>
        ) : null}

        <FormField label={t.household.goals.fields.description}>
          <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
        </FormField>
      </Surface>

      <Surface className="space-y-5 p-5 sm:p-6">
        <div>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">{t.household.goals.fields.kind}</h2>
          <div role="group" aria-label={t.household.goals.fields.kind} className="mt-3 grid gap-2.5 sm:grid-cols-3">
            {GOAL_KINDS.map((goalKind) => (
              <button
                key={goalKind}
                type="button"
                aria-pressed={kind === goalKind}
                disabled={accountAndKindLocked}
                onClick={() => selectKind(goalKind)}
                className={cn(
                  'min-h-16 rounded-card border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
                  kind === goalKind ? 'border-primary bg-primary-soft text-foreground' : 'border-outline bg-surface-raised text-foreground-secondary hover:text-foreground',
                )}
              >
                <span className="block text-sm font-semibold">{t.household.goals.kindLabels[goalKind]}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted">{t.household.goals.kindDescriptions[goalKind]}</span>
              </button>
            ))}
          </div>
        </div>

        {kind === 'ONE_OFF' ? (
          <div className="space-y-5">
            <FormField label={t.household.goals.fields.targetAmount} required>
              <Input value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} inputMode="decimal" placeholder="0,00" />
            </FormField>
            <div>
              <p className="text-sm font-semibold text-foreground">{t.household.goals.fields.planMode}</p>
              <div role="group" aria-label={t.household.goals.fields.planMode} className="mt-2 grid gap-2 sm:grid-cols-2">
                {(['date', 'monthly'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={planMode === value}
                    onClick={() => selectPlanMode(value)}
                    className={cn(
                      'min-h-11 rounded-control border px-3 text-left text-sm transition',
                      planMode === value ? 'border-primary bg-primary-soft font-semibold text-foreground' : 'border-outline-control bg-surface-raised text-foreground-secondary hover:text-foreground',
                    )}
                  >
                    {value === 'date' ? t.household.goals.fields.planByDate : t.household.goals.fields.planByMonthlyAmount}
                  </button>
                ))}
              </div>
            </div>
            {planMode === 'date' ? (
              <FormField label={t.household.goals.fields.targetDate} required>
                <Input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
              </FormField>
            ) : (
              <FormField label={t.household.goals.fields.monthlyAmount} required>
                <Input value={monthlyAmount} onChange={(event) => setMonthlyAmount(event.target.value)} inputMode="decimal" placeholder="0,00" />
              </FormField>
            )}
          </div>
        ) : kind === 'ONGOING' ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label={t.household.goals.fields.targetAmount} required>
              <Input value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} inputMode="decimal" placeholder="0,00" />
            </FormField>
            <FormField label={t.household.goals.fields.monthlyAmount} required>
              <Input value={monthlyAmount} onChange={(event) => setMonthlyAmount(event.target.value)} inputMode="decimal" placeholder="0,00" />
            </FormField>
          </div>
        ) : (
          <FormField label={t.household.goals.fields.monthlyAmount} required>
            <Input value={monthlyAmount} onChange={(event) => setMonthlyAmount(event.target.value)} inputMode="decimal" placeholder="0,00" />
          </FormField>
        )}

        {accountAndKindLocked ? <p className="text-sm text-muted">{t.household.goals.editImmutableHint}</p> : null}
      </Surface>

      {eligibleAccounts.length === 0 ? <ErrorState message={t.household.goals.accountUnavailable} /> : null}

      <div className="flex flex-wrap justify-end gap-3">
        <Button href={goal ? `/household/goals/${goal.id}` : '/household/goals'} variant="secondary">{t.household.goals.cancel}</Button>
        <Button type="submit" disabled={submitting || eligibleAccounts.length === 0}>
          {submitting ? t.household.goals.saving : t.household.goals.save}
        </Button>
      </div>
    </form>
  );
}

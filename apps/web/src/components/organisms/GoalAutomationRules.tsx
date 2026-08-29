'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type {
  HouseholdAccount,
  HouseholdGoal,
  HouseholdGoalAutomationRule,
  HouseholdGoalAutomationRuleType,
} from '../../lib/api-types';
import {
  createHouseholdGoalAutomationRule,
  deleteHouseholdGoalAutomationRule,
  updateHouseholdGoalAutomationRule,
} from '../../lib/api-client';
import { formatMoney, formatPercentage, parseDecimalValue, todayAsCalendarDate } from '../../lib/format';
import { validateGoalAutomationRuleForm } from '../../lib/household-validation';
import { t } from '../../lib/translations';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { Surface } from '../atoms/Surface';
import { AccountPicker } from '../molecules/AccountPicker';
import { EmptyState } from '../molecules/EmptyState';
import { ErrorState } from '../molecules/ErrorState';
import { FormField } from '../molecules/FormField';
import { cn } from '../../lib/cn';

interface GoalAutomationRulesProps {
  householdId: string;
  goal: HouseholdGoal;
  accounts: HouseholdAccount[];
  rules: HouseholdGoalAutomationRule[];
  readOnly?: boolean;
  readOnlyReason?: 'ARCHIVED' | 'COMPLETED';
}

const RULE_TYPES: HouseholdGoalAutomationRuleType[] = [
  'FIXED_ON_DAY',
  'PERCENT_OF_INCOME_OVER_THRESHOLD',
  'ROUND_UP',
];

export function GoalAutomationRules({ householdId, goal, accounts, rules, readOnly = false, readOnlyReason = 'ARCHIVED' }: GoalAutomationRulesProps) {
  const router = useRouter();
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eligibleAccounts = accounts.filter((account) => account.type !== 'CREDIT_CARD');
  const fundingAccounts = eligibleAccounts.filter((account) => account.id !== goal.accountId);

  const changeRuleState = async (rule: HouseholdGoalAutomationRule) => {
    setError(null);
    setBusyRuleId(rule.id);
    const result = await updateHouseholdGoalAutomationRule(householdId, goal.id, rule.id, { isActive: !rule.isActive }).catch((submitError: Error) => submitError);
    setBusyRuleId(null);
    if (result instanceof Error) {
      setError(result.message);
      return;
    }
    router.refresh();
  };

  const deleteRule = async (rule: HouseholdGoalAutomationRule) => {
    if (!window.confirm(t.household.goals.rules.deleteConfirm)) return;
    setError(null);
    setBusyRuleId(rule.id);
    const result = await deleteHouseholdGoalAutomationRule(householdId, goal.id, rule.id).then(() => null).catch((submitError: Error) => submitError);
    setBusyRuleId(null);
    if (result instanceof Error) {
      setError(result.message);
      return;
    }
    setEditingRuleId(null);
    router.refresh();
  };

  return (
    <div className="space-y-5">
      {error ? <ErrorState message={error} /> : null}
      {readOnly ? (
        <p className="rounded-inset bg-surface-raised px-4 py-3 text-sm text-muted">
          {readOnlyReason === 'COMPLETED' ? t.household.goals.rules.readOnlyCompleted : t.household.goals.rules.readOnly}
        </p>
      ) : fundingAccounts.length === 0 ? (
        <ErrorState message={t.household.goals.rules.noAccounts} />
      ) : (
        <GoalAutomationRuleForm
          householdId={householdId}
          goalId={goal.id}
          goalAccountId={goal.accountId}
          accounts={eligibleAccounts}
          fundingAccounts={fundingAccounts}
        />
      )}

      {rules.length === 0 ? (
        <EmptyState title={t.household.goals.noRulesTitle} description={t.household.goals.noRulesDescription} />
      ) : (
        <div className="space-y-3" aria-label={t.household.goals.rulesTitle}>
          {rules.map((rule) => {
            const fundingAccount = accounts.find((account) => account.id === rule.fundingAccountId);
            const triggerAccount = accounts.find((account) => account.id === rule.triggerAccountId);
            return (
              <Surface key={rule.id} className="space-y-4 p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{t.household.goals.rules.typeLabels[rule.ruleType]}</h3>
                      <Badge tone={rule.isActive ? 'success' : 'draft'}>{rule.isActive ? t.household.goals.rules.active : t.household.goals.rules.paused}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">{ruleDescription(rule, fundingAccount?.name, triggerAccount?.name)}</p>
                  </div>
                  {!readOnly ? <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
                    <Button variant="secondary" size="sm" disabled={busyRuleId === rule.id} onClick={() => changeRuleState(rule)} aria-pressed={rule.isActive}>
                      {rule.isActive ? t.household.goals.rules.disable : t.household.goals.rules.enable}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busyRuleId === rule.id} onClick={() => setEditingRuleId(editingRuleId === rule.id ? null : rule.id)}>
                      {t.household.goals.rules.edit}
                    </Button>
                    <Button variant="danger" size="sm" disabled={busyRuleId === rule.id} onClick={() => deleteRule(rule)}>
                      {t.household.goals.rules.delete}
                    </Button>
                  </div> : null}
                </div>
                {!readOnly && editingRuleId === rule.id ? (
                  <GoalAutomationRuleForm
                    householdId={householdId}
                    goalId={goal.id}
                    goalAccountId={goal.accountId}
                    accounts={eligibleAccounts}
                    fundingAccounts={fundingAccounts}
                    rule={rule}
                    onCancel={() => setEditingRuleId(null)}
                  />
                ) : null}
              </Surface>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface GoalAutomationRuleFormProps {
  householdId: string;
  goalId: string;
  goalAccountId: string;
  accounts: HouseholdAccount[];
  fundingAccounts: HouseholdAccount[];
  rule?: HouseholdGoalAutomationRule;
  onCancel?: () => void;
}

function GoalAutomationRuleForm({ householdId, goalId, goalAccountId, accounts, fundingAccounts, rule, onCancel }: GoalAutomationRuleFormProps) {
  const router = useRouter();
  const [ruleType, setRuleType] = useState<HouseholdGoalAutomationRuleType>(rule?.ruleType ?? 'FIXED_ON_DAY');
  const [fundingAccountId, setFundingAccountId] = useState(rule?.fundingAccountId ?? fundingAccounts[0]?.id ?? '');
  const [triggerAccountId, setTriggerAccountId] = useState(rule?.triggerAccountId ?? '');
  const [startsOn, setStartsOn] = useState(rule?.startsOn ?? todayAsCalendarDate());
  const [fixedAmount, setFixedAmount] = useState(rule?.fixedAmount ?? '');
  const [dayOfMonth, setDayOfMonth] = useState(rule?.dayOfMonth?.toString() ?? '1');
  const [percentage, setPercentage] = useState(rule?.percentage ?? '');
  const [incomeThreshold, setIncomeThreshold] = useState(rule?.incomeThreshold ?? '');
  const [roundUpToAmount, setRoundUpToAmount] = useState(rule?.roundUpToAmount ?? '');
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const validationError = validateGoalAutomationRuleForm({
      ruleType,
      fundingAccountId,
      goalAccountId,
      triggerAccountId,
      startsOn,
      fixedAmount,
      dayOfMonth,
      percentage,
      incomeThreshold,
      roundUpToAmount,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    const normalizedFixedAmount = ruleType === 'FIXED_ON_DAY' ? parseDecimalValue(fixedAmount)?.toFixed(2) ?? null : null;
    const normalizedPercentage = ruleType === 'PERCENT_OF_INCOME_OVER_THRESHOLD' ? parseDecimalValue(percentage)?.toFixed(2) ?? null : null;
    const normalizedIncomeThreshold = ruleType === 'PERCENT_OF_INCOME_OVER_THRESHOLD' ? parseDecimalValue(incomeThreshold)?.toFixed(2) ?? null : null;
    const normalizedRoundUpToAmount = ruleType === 'ROUND_UP' ? parseDecimalValue(roundUpToAmount)?.toFixed(2) ?? null : null;
    const normalizedDayOfMonth = ruleType === 'FIXED_ON_DAY' ? Number(dayOfMonth) : null;
    const normalizedTriggerAccountId = ruleType === 'FIXED_ON_DAY' ? null : triggerAccountId;

    setSubmitting(true);
    if (rule) {
      const result = await updateHouseholdGoalAutomationRule(householdId, rule.goalId, rule.id, {
        fundingAccountId,
        triggerAccountId: normalizedTriggerAccountId,
        startsOn,
        isActive,
        fixedAmount: normalizedFixedAmount,
        dayOfMonth: normalizedDayOfMonth,
        percentage: normalizedPercentage,
        incomeThreshold: normalizedIncomeThreshold,
        roundUpToAmount: normalizedRoundUpToAmount,
      }).catch((submitError: Error) => submitError);
      setSubmitting(false);
      if (result instanceof Error) {
        setError(result.message);
        return;
      }
      onCancel?.();
      router.refresh();
      return;
    }

    const result = await createHouseholdGoalAutomationRule(householdId, goalId, {
      ruleType,
      fundingAccountId,
      ...(normalizedTriggerAccountId ? { triggerAccountId: normalizedTriggerAccountId } : {}),
      startsOn,
      isActive,
      ...(normalizedFixedAmount ? { fixedAmount: normalizedFixedAmount, dayOfMonth: normalizedDayOfMonth ?? 1 } : {}),
      ...(normalizedPercentage ? { percentage: normalizedPercentage } : {}),
      ...(normalizedIncomeThreshold ? { incomeThreshold: normalizedIncomeThreshold } : {}),
      ...(normalizedRoundUpToAmount ? { roundUpToAmount: normalizedRoundUpToAmount } : {}),
    }).catch((submitError: Error) => submitError);
    setSubmitting(false);
    if (result instanceof Error) {
      setError(result.message);
      return;
    }
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-card border border-dashed border-outline bg-surface-panel p-4 sm:p-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">{rule ? t.household.goals.rules.editTitle : t.household.goals.rules.addTitle}</h2>
        <p className="mt-1 text-sm text-muted">{t.household.goals.rules.typeDescriptions[ruleType]}</p>
      </div>
      {error ? <ErrorState message={error} /> : null}

      {!rule ? (
        <div role="group" aria-label={t.household.goals.rules.ruleType} className="grid gap-2 sm:grid-cols-3">
          {RULE_TYPES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={ruleType === value}
              onClick={() => setRuleType(value)}
              className={cn(
                'min-h-14 rounded-control border px-3 py-2 text-left text-xs transition',
                ruleType === value ? 'border-primary bg-primary-soft font-semibold text-foreground' : 'border-outline-control bg-surface-raised text-foreground-secondary hover:text-foreground',
              )}
            >
              {t.household.goals.rules.typeLabels[value]}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label={t.household.goals.rules.fundingAccount} required>
          <AccountPicker accounts={fundingAccounts} value={fundingAccountId} onChange={setFundingAccountId} ariaLabel={t.household.goals.rules.fundingAccount} />
        </FormField>
        {ruleType === 'FIXED_ON_DAY' ? (
          <FormField label={t.household.goals.rules.startsOn} required>
            <Input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} />
          </FormField>
        ) : (
          <FormField label={t.household.goals.rules.triggerAccount} required>
            <AccountPicker accounts={accounts} value={triggerAccountId} onChange={setTriggerAccountId} ariaLabel={t.household.goals.rules.triggerAccount} />
          </FormField>
        )}
      </div>

      {ruleType !== 'FIXED_ON_DAY' ? (
        <FormField label={t.household.goals.rules.startsOn} required>
          <Input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} />
        </FormField>
      ) : null}

      {ruleType === 'FIXED_ON_DAY' ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={t.household.goals.rules.fixedAmount} required>
            <Input value={fixedAmount} onChange={(event) => setFixedAmount(event.target.value)} inputMode="decimal" placeholder="0,00" />
          </FormField>
          <FormField label={t.household.goals.rules.dayOfMonth} required hint="Od 1 do 28, aby każdy miesiąc miał poprawny termin.">
            <Input value={dayOfMonth} onChange={(event) => setDayOfMonth(event.target.value)} inputMode="numeric" />
          </FormField>
        </div>
      ) : ruleType === 'PERCENT_OF_INCOME_OVER_THRESHOLD' ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={t.household.goals.rules.percentage} required>
            <Input value={percentage} onChange={(event) => setPercentage(event.target.value)} inputMode="decimal" placeholder="10,5" />
          </FormField>
          <FormField label={t.household.goals.rules.incomeThreshold} required>
            <Input value={incomeThreshold} onChange={(event) => setIncomeThreshold(event.target.value)} inputMode="decimal" placeholder="0,00" />
          </FormField>
        </div>
      ) : (
        <FormField label={t.household.goals.rules.roundUpToAmount} required hint="Np. 10 zł odkłada różnicę do najbliższych 10 zł.">
          <Input value={roundUpToAmount} onChange={(event) => setRoundUpToAmount(event.target.value)} inputMode="decimal" placeholder="10,00" />
        </FormField>
      )}

      <label className="flex min-h-11 items-center gap-3 rounded-inset bg-surface-raised px-4 py-3 text-sm text-foreground-secondary">
        <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="h-4 w-4 rounded border-outline-control" />
        <span>{t.household.goals.rules.enabled}</span>
      </label>

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? <Button type="button" variant="secondary" disabled={submitting} onClick={onCancel}>{t.household.goals.rules.cancel}</Button> : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? t.household.goals.rules.saving : rule ? t.household.goals.rules.save : t.household.goals.rules.create}
        </Button>
      </div>
    </form>
  );
}

function ruleDescription(rule: HouseholdGoalAutomationRule, fundingAccountName?: string, triggerAccountName?: string): string {
  const funding = fundingAccountName ?? 'wybrane konto';
  if (rule.ruleType === 'FIXED_ON_DAY') {
    return `${rule.fixedAmount ? formatMoney(rule.fixedAmount) : 'Stała kwota'} · dzień ${rule.dayOfMonth ?? '—'} · ${funding}`;
  }
  if (rule.ruleType === 'PERCENT_OF_INCOME_OVER_THRESHOLD') {
    return `${rule.percentage ? formatPercentage(rule.percentage, 1, 2) : '—'} powyżej ${rule.incomeThreshold ? formatMoney(rule.incomeThreshold) : formatMoney(0)} · ${triggerAccountName ?? 'wybrane konto'} → ${funding}`;
  }
  return `Do ${rule.roundUpToAmount ? formatMoney(rule.roundUpToAmount) : '—'} · ${triggerAccountName ?? 'wybrane konto'} → ${funding}`;
}

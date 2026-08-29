'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CommitmentBillingFrequency, CommitmentType, HouseholdAccount } from '../../../../../lib/api-types';
import { createCommitment } from '../../../../../lib/api-client';
import { parseDecimalValue, todayAsCalendarDate } from '../../../../../lib/format';
import { validateCommitmentForm } from '../../../../../lib/household-validation';
import { t } from '../../../../../lib/translations';
import { AccountPicker } from '../../../../../components/molecules/AccountPicker';
import { Button } from '../../../../../components/atoms/Button';
import { ErrorState } from '../../../../../components/molecules/ErrorState';
import { FormField } from '../../../../../components/molecules/FormField';
import { Input } from '../../../../../components/atoms/Input';
import { Select } from '../../../../../components/atoms/Select';
import { cn } from '../../../../../lib/cn';

const COMMITMENT_TYPES: CommitmentType[] = ['INSURANCE', 'LOAN', 'SUBSCRIPTION', 'UTILITY', 'OTHER'];
const BILLING_FREQUENCIES: CommitmentBillingFrequency[] = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'];

export function NewCommitmentForm({ householdId, accounts }: { householdId: string; accounts: HouseholdAccount[] }) {
  const router = useRouter();

  const [type, setType] = useState<CommitmentType>('INSURANCE');
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [billingFrequency, setBillingFrequency] = useState<CommitmentBillingFrequency>('MONTHLY');
  const [nextDueDate, setNextDueDate] = useState(todayAsCalendarDate());
  const [isAutomatic, setIsAutomatic] = useState(true);
  const [provider, setProvider] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [insuredObject, setInsuredObject] = useState('');
  const [sumInsured, setSumInsured] = useState('');
  const [principal, setPrincipal] = useState('');
  const [outstandingBalance, setOutstandingBalance] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [termMonths, setTermMonths] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const validationError = validateCommitmentForm({ type, name, accountId, amount, nextDueDate, provider, termMonths });
    if (validationError) {
      setError(validationError);
      return;
    }

    const parsedAmount = parseDecimalValue(amount);
    if (parsedAmount === null) return;

    let normalizedSumInsured: string | undefined;
    if (type === 'INSURANCE' && sumInsured.trim()) {
      const parsedSumInsured = parseDecimalValue(sumInsured);
      if (parsedSumInsured === null || parsedSumInsured < 0) {
        setError(t.household.commitmentForm.amountRequiredError);
        return;
      }
      normalizedSumInsured = parsedSumInsured.toFixed(2);
    }

    let normalizedPrincipal: string | undefined;
    let normalizedOutstandingBalance: string | undefined;
    let normalizedInterestRate: string | undefined;
    if (type === 'LOAN') {
      if (principal.trim()) {
        const parsedPrincipal = parseDecimalValue(principal);
        if (parsedPrincipal === null || parsedPrincipal < 0) {
          setError(t.household.commitmentForm.amountRequiredError);
          return;
        }
        normalizedPrincipal = parsedPrincipal.toFixed(2);
      }

      if (outstandingBalance.trim()) {
        const parsedOutstandingBalance = parseDecimalValue(outstandingBalance);
        if (parsedOutstandingBalance === null || parsedOutstandingBalance < 0) {
          setError(t.household.commitmentForm.amountRequiredError);
          return;
        }
        normalizedOutstandingBalance = parsedOutstandingBalance.toFixed(2);
      }

      if (interestRate.trim()) {
        const parsedInterestRate = parseDecimalValue(interestRate);
        if (parsedInterestRate === null || parsedInterestRate < 0) {
          setError(t.household.commitmentForm.interestRateError);
          return;
        }
        normalizedInterestRate = (parsedInterestRate / 100).toFixed(4);
      }
    }

    setSubmitting(true);
    const result = await createCommitment(householdId, {
      accountId,
      type,
      name: name.trim(),
      amount: parsedAmount.toFixed(2),
      billingFrequency,
      nextDueDate,
      isAutomatic,
      provider: provider.trim() || undefined,
      policyNumber: type === 'INSURANCE' ? policyNumber.trim() || undefined : undefined,
      insuredObject: type === 'INSURANCE' ? insuredObject.trim() || undefined : undefined,
      sumInsured: normalizedSumInsured,
      principal: normalizedPrincipal,
      outstandingBalance: normalizedOutstandingBalance,
      interestRate: normalizedInterestRate,
      termMonths: type === 'LOAN' ? Number(termMonths) : undefined,
    }).catch((submitError: Error) => submitError);
    setSubmitting(false);

    if (result instanceof Error) {
      setError(result.message);
      return;
    }

    router.push('/household/commitments');
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-card border border-outline bg-surface-panel p-5 sm:p-6">
      {error ? <ErrorState message={error} /> : null}

      {/* Type is the form's primary branch — a prominent segmented control, not a buried select. */}
      <div role="group" aria-label={t.household.commitmentForm.fields.type} className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {COMMITMENT_TYPES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={type === value}
            onClick={() => setType(value)}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-card border px-3 py-3.5 text-center text-[12.5px] font-medium transition',
              type === value
                ? 'border-primary bg-primary-soft text-foreground font-semibold'
                : 'border-outline bg-surface-raised text-foreground-secondary hover:text-foreground',
            )}
          >
            {t.household.commitments.types[value]}
          </button>
        ))}
      </div>

      <FormSection title={type === 'INSURANCE' ? t.household.commitmentForm.sections.policy : t.household.commitmentForm.sections.details}>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={t.household.commitmentForm.fields.name} required>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </FormField>
          <FormField label={type === 'INSURANCE' ? t.household.commitmentForm.fields.provider : t.household.commitmentForm.fields.providerGeneric} required={type === 'INSURANCE'}>
            <Input value={provider} onChange={(event) => setProvider(event.target.value)} />
          </FormField>
          {type === 'INSURANCE' ? (
            <>
              <FormField label={t.household.commitmentForm.fields.policyNumber}>
                <Input value={policyNumber} onChange={(event) => setPolicyNumber(event.target.value)} />
              </FormField>
              <FormField label={t.household.commitmentForm.fields.insuredObject}>
                <Input value={insuredObject} onChange={(event) => setInsuredObject(event.target.value)} />
              </FormField>
              <FormField label={t.household.commitmentForm.fields.sumInsured}>
                <Input value={sumInsured} onChange={(event) => setSumInsured(event.target.value)} inputMode="decimal" />
              </FormField>
            </>
          ) : null}
        </div>
      </FormSection>

      <FormSection title={t.household.commitmentForm.sections.moneyAndTiming}>
        <div className="grid gap-5 sm:grid-cols-3">
          <FormField label={t.household.commitmentForm.fields.amount} required>
            <Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0,00" />
          </FormField>
          <FormField label={t.household.commitmentForm.fields.billingFrequency} required>
            <Select value={billingFrequency} onChange={(event) => setBillingFrequency(event.target.value as CommitmentBillingFrequency)}>
              {BILLING_FREQUENCIES.map((value) => (
                <option key={value} value={value}>{t.household.commitments.frequencies[value]}</option>
              ))}
            </Select>
          </FormField>
          <FormField label={t.household.commitmentForm.fields.nextDueDate} required>
            <Input type="date" value={nextDueDate} onChange={(event) => setNextDueDate(event.target.value)} />
          </FormField>
        </div>
      </FormSection>

      {type === 'LOAN' ? (
        <FormSection title={t.household.commitmentForm.sections.loanDetails}>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label={t.household.commitmentForm.fields.principal}>
              <Input value={principal} onChange={(event) => setPrincipal(event.target.value)} inputMode="decimal" />
            </FormField>
            <FormField label={t.household.commitmentForm.fields.outstandingBalance}>
              <Input value={outstandingBalance} onChange={(event) => setOutstandingBalance(event.target.value)} inputMode="decimal" />
            </FormField>
            <FormField label={t.household.commitmentForm.fields.interestRate}>
              <Input value={interestRate} onChange={(event) => setInterestRate(event.target.value)} inputMode="decimal" />
            </FormField>
            <FormField label={t.household.commitmentForm.fields.termMonths}>
              <Input value={termMonths} onChange={(event) => setTermMonths(event.target.value)} inputMode="numeric" />
            </FormField>
          </div>
        </FormSection>
      ) : null}

      <FormSection
        title={t.household.commitmentForm.sections.paidFrom}
        action={<Link href="/household/settings/accounts" className="text-sm font-medium text-primary-strong hover:text-primary">{t.household.commitmentForm.manageAccounts}</Link>}
      >
        <div className="flex flex-col gap-4">
          <FormField label={t.household.commitmentForm.fields.account} required>
            <AccountPicker ariaLabel={t.household.commitmentForm.fields.account} accounts={accounts} value={accountId} onChange={setAccountId} />
          </FormField>
          <label className="flex items-center justify-between gap-3 rounded-inset bg-surface-raised px-4 py-3 text-sm text-foreground-secondary">
            <span className="flex flex-col gap-0.5">
              <span className="text-foreground">{t.household.commitmentForm.isAutomaticLabel}</span>
              <span className="text-[12px] text-muted">{t.household.commitmentForm.isAutomaticHint}</span>
            </span>
            <input type="checkbox" checked={isAutomatic} onChange={(event) => setIsAutomatic(event.target.checked)} className="h-4 w-4 rounded border-outline-control" />
          </label>
        </div>
      </FormSection>

      <div className="flex justify-end gap-3 border-t border-outline pt-5">
        <Button type="button" variant="secondary" onClick={() => router.back()}>{t.household.commitmentForm.cancel}</Button>
        <Button type="submit" disabled={submitting}>{t.household.commitmentForm.save}</Button>
      </div>
    </form>
  );
}

function FormSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-outline bg-surface-raised/40 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

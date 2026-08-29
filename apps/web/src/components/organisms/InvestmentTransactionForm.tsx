'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { HouseholdInvestmentPosition, HouseholdInvestmentTransactionType } from '../../lib/api-types';
import { createHouseholdInvestmentTransaction } from '../../lib/api-client';
import { normalizeInvestmentDecimal, validateInvestmentTransactionForm } from '../../lib/household-investment-validation';
import { todayAsCalendarDate } from '../../lib/format';
import { t } from '../../lib/phase3-translations';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { Surface } from '../atoms/Surface';
import { ErrorState } from '../molecules/ErrorState';
import { FormField } from '../molecules/FormField';
import { cn } from '../../lib/cn';

const transactionTypes: HouseholdInvestmentTransactionType[] = ['BUY', 'SELL', 'VALUATION_UPDATE', 'CONTRIBUTION'];

interface InvestmentTransactionFormProps {
  householdId: string;
  position: HouseholdInvestmentPosition;
}

export function InvestmentTransactionForm({ householdId, position }: InvestmentTransactionFormProps) {
  const router = useRouter();
  const [type, setType] = useState<HouseholdInvestmentTransactionType>('BUY');
  const [amount, setAmount] = useState('');
  const [units, setUnits] = useState('');
  const [date, setDate] = useState(todayAsCalendarDate());
  const [operationId, setOperationId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitTransaction = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const validationError = validateInvestmentTransactionForm({ type, amount, units, date, operationId });
    if (validationError) {
      setError(validationError);
      return;
    }

    const normalizedAmount = normalizeInvestmentDecimal(amount, 2);
    const normalizedUnits = units.trim() ? normalizeInvestmentDecimal(units, 8) : null;
    if (normalizedAmount === null || ((type === 'BUY' || type === 'SELL') && normalizedUnits === null)) {
      setError('Sprawdź format kwoty i liczby jednostek.');
      return;
    }

    const resolvedOperationId = operationId.trim() || window.crypto.randomUUID();
    setOperationId(resolvedOperationId);
    setSubmitting(true);
    const result = await createHouseholdInvestmentTransaction(householdId, position.id, {
      type,
      amount: normalizedAmount,
      date,
      operationId: resolvedOperationId,
      ...(normalizedUnits ? { units: normalizedUnits } : {}),
    }).catch((submitError: Error) => submitError);
    setSubmitting(false);

    if (result instanceof Error) {
      setError(result.message);
      return;
    }

    router.push(`/household/investing/${position.id}`);
    router.refresh();
  };

  return (
    <form onSubmit={submitTransaction} className="space-y-6">
      {error ? <ErrorState message={error} /> : null}
      <Surface className="space-y-5 p-5 sm:p-6">
        <div>
          <p className="text-sm font-semibold text-foreground">{t.household.investing.transactionFields.type}</p>
          <div role="group" aria-label={t.household.investing.transactionFields.type} className="mt-3 grid gap-2 sm:grid-cols-2">
            {transactionTypes.map((value) => (
              <button key={value} type="button" aria-pressed={type === value} onClick={() => { setType(value); if (value !== 'BUY' && value !== 'SELL') setUnits(''); }} className={cn('min-h-12 rounded-control border px-3 text-left text-sm transition', type === value ? 'border-primary bg-primary-soft font-semibold text-foreground' : 'border-outline-control bg-surface-raised text-foreground-secondary hover:text-foreground')}>
                {t.household.investing.transactionTypes[value]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={t.household.investing.transactionFields.amount} htmlFor="investment-transaction-amount" required hint={type === 'VALUATION_UPDATE' ? t.household.investing.valuationMayBeZero : undefined}>
            <Input id="investment-transaction-amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0,00" aria-describedby="investment-transaction-help investment-transaction-error" aria-invalid={Boolean(error)} />
          </FormField>
          {type === 'BUY' || type === 'SELL' ? (
            <FormField label={t.household.investing.transactionFields.units} htmlFor="investment-transaction-units" required>
              <Input id="investment-transaction-units" value={units} onChange={(event) => setUnits(event.target.value)} inputMode="decimal" placeholder="0,00000000" aria-describedby="investment-transaction-help investment-transaction-error" aria-invalid={Boolean(error)} />
            </FormField>
          ) : <div className="flex items-end text-sm text-muted">{t.household.investing.contributionOnlyNoUnits}</div>}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={t.household.investing.transactionFields.date} htmlFor="investment-transaction-date" required>
            <Input id="investment-transaction-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-describedby="investment-transaction-error" aria-invalid={Boolean(error)} />
          </FormField>
          <FormField label={t.household.investing.transactionFields.operationId} htmlFor="investment-transaction-operation" hint={t.household.investing.transactionOperationHint} required>
            <Input id="investment-transaction-operation" value={operationId} onChange={(event) => setOperationId(event.target.value)} autoComplete="off" aria-describedby="investment-transaction-help investment-transaction-error" aria-invalid={Boolean(error)} />
          </FormField>
        </div>
        <p id="investment-transaction-help" className="text-sm text-muted">{t.household.investing.transactionFormDescription}</p>
        {error ? <p id="investment-transaction-error" className="sr-only">{error}</p> : null}
      </Surface>

      <div className="sticky bottom-0 -mx-1 flex justify-end gap-3 border-t border-outline bg-background/95 px-1 py-4 sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="button" variant="secondary" href={`/household/investing/${position.id}`}>{t.household.investing.transactionCancel}</Button>
        <Button type="submit" disabled={submitting}>{submitting ? t.household.investing.transactionSaving : t.household.investing.transactionSave}</Button>
      </div>
    </form>
  );
}

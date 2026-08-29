'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { HouseholdAccountType, HouseholdAccountVisibility } from '../../../../../lib/api-types';
import { createHouseholdAccount } from '../../../../../lib/api-client';
import { parseDecimalValue } from '../../../../../lib/format';
import { t } from '../../../../../lib/translations';
import { Button } from '../../../../../components/atoms/Button';
import { ErrorState } from '../../../../../components/molecules/ErrorState';
import { FormField } from '../../../../../components/molecules/FormField';
import { Input } from '../../../../../components/atoms/Input';
import { Select } from '../../../../../components/atoms/Select';

const ACCOUNT_TYPES: HouseholdAccountType[] = ['CURRENT', 'SAVINGS', 'CREDIT_CARD', 'CASH'];

export function AccountForm({ householdId, onCreated }: { householdId: string; onCreated?: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [type, setType] = useState<HouseholdAccountType>('CURRENT');
  const [visibility, setVisibility] = useState<HouseholdAccountVisibility>('SHARED');
  const [accountNumberMask, setAccountNumberMask] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(t.household.accountForm.nameRequiredError);
      return;
    }

    const parsedOpeningBalance = openingBalance.trim() ? parseDecimalValue(openingBalance) : 0;
    if (parsedOpeningBalance === null) {
      setError(t.household.accountForm.openingBalanceInvalidError);
      return;
    }

    setSubmitting(true);
    const result = await createHouseholdAccount(householdId, {
      name: name.trim(),
      type,
      visibility,
      accountNumberMask: accountNumberMask.trim() || undefined,
      openingBalance: parsedOpeningBalance.toFixed(2),
    }).catch((submitError: Error) => submitError);
    setSubmitting(false);

    if (result instanceof Error) {
      setError(result.message);
      return;
    }

    setName('');
    setAccountNumberMask('');
    setOpeningBalance('');
    onCreated?.();
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-card border border-outline bg-surface-panel p-5 sm:p-6">
      {error ? <ErrorState message={error} /> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label={t.household.accountForm.fields.name} required>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </FormField>
        <FormField label={t.household.accountForm.fields.type} required>
          <Select value={type} onChange={(event) => setType(event.target.value as HouseholdAccountType)}>
            {ACCOUNT_TYPES.map((value) => (
              <option key={value} value={value}>{t.household.accountPicker.typeLabels[value]}</option>
            ))}
          </Select>
        </FormField>
        <FormField label={t.household.accountForm.fields.visibility}>
          <Select value={visibility} onChange={(event) => setVisibility(event.target.value as HouseholdAccountVisibility)}>
            <option value="SHARED">{t.household.accountPicker.visibilityLabels.SHARED}</option>
            <option value="PRIVATE">{t.household.accountPicker.visibilityLabels.PRIVATE}</option>
          </Select>
        </FormField>
        <FormField label={t.household.accountForm.fields.accountNumberMask}>
          <Input value={accountNumberMask} onChange={(event) => setAccountNumberMask(event.target.value)} placeholder="•••• 4417" />
        </FormField>
        <FormField label={t.household.accountForm.fields.openingBalance}>
          <Input value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} inputMode="decimal" placeholder="0,00" />
        </FormField>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>{t.household.transactionForm.save}</Button>
      </div>
    </form>
  );
}

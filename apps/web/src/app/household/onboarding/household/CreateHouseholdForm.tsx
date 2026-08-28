'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createHousehold } from '../../../../lib/api-client';
import { t } from '../../../../lib/translations';
import { Button } from '../../../../components/atoms/Button';
import { ErrorState } from '../../../../components/molecules/ErrorState';
import { FormField } from '../../../../components/molecules/FormField';
import { Input } from '../../../../components/atoms/Input';

const MODE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function CreateHouseholdForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(t.household.transactionForm.payeeRequiredError);
      return;
    }

    setSubmitting(true);
    const result = await createHousehold({ name: name.trim() }).catch((submitError: Error) => submitError);
    setSubmitting(false);

    if (result instanceof Error) {
      setError(result.message);
      return;
    }

    document.cookie = `active_household=${result.id}; path=/; max-age=${MODE_COOKIE_MAX_AGE}; SameSite=Lax`;
    document.cookie = `active_mode=personal; path=/; max-age=${MODE_COOKIE_MAX_AGE}; SameSite=Lax`;
    router.push('/household/onboarding/accounts');
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-5">
      {error ? <ErrorState message={error} /> : null}
      <FormField label={t.household.onboarding.householdNameLabel} required>
        <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      </FormField>
      <Button type="submit" disabled={submitting}>{t.household.onboarding.continue}</Button>
    </form>
  );
}

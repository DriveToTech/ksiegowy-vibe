'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { voidHouseholdInvestmentTransaction } from '../../lib/api-client';
import { t } from '../../lib/phase3-translations';
import { Button } from '../atoms/Button';

interface InvestmentVoidActionProps {
  householdId: string;
  positionId: string;
  transactionId: string;
}

export function InvestmentVoidAction({ householdId, positionId, transactionId }: InvestmentVoidActionProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const voidTransaction = async () => {
    if (!window.confirm(t.household.investing.voidConfirm)) return;
    setError(null);
    setSubmitting(true);
    const result = await voidHouseholdInvestmentTransaction(householdId, positionId, transactionId).catch((submitError: Error) => submitError);
    setSubmitting(false);
    if (result instanceof Error) {
      setError(result.message);
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="secondary" size="sm" onClick={voidTransaction} disabled={submitting} aria-label={`${t.household.investing.voidAction} ${transactionId}`}>
        {submitting ? t.household.investing.voiding : t.household.investing.voidAction}
      </Button>
      {error ? <p className="max-w-48 text-right text-xs text-error-ink" role="alert">{error}</p> : null}
    </div>
  );
}

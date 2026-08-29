'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { HouseholdInvestmentPosition, HouseholdInvestmentVisibility, HouseholdInvestmentWrapper } from '../../lib/api-types';
import { createHouseholdInvestmentPosition, updateHouseholdInvestmentPosition } from '../../lib/api-client';
import { normalizeInvestmentDecimal, validateInvestmentPositionForm } from '../../lib/household-investment-validation';
import { t } from '../../lib/phase3-translations';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { Surface } from '../atoms/Surface';
import { ErrorState } from '../molecules/ErrorState';
import { FormField } from '../molecules/FormField';
import { cn } from '../../lib/cn';

const wrappers: HouseholdInvestmentWrapper[] = ['TAXABLE', 'IKE', 'IKZE'];
const visibilities: HouseholdInvestmentVisibility[] = ['PRIVATE', 'SHARED'];

interface InvestmentPositionFormProps {
  householdId: string;
  position?: HouseholdInvestmentPosition;
}

export function InvestmentPositionForm({ householdId, position }: InvestmentPositionFormProps) {
  const router = useRouter();
  const [wrapper, setWrapper] = useState<HouseholdInvestmentWrapper>(position?.wrapper ?? 'TAXABLE');
  const [instrument, setInstrument] = useState(position?.instrument ?? '');
  const [visibility, setVisibility] = useState<HouseholdInvestmentVisibility>(position?.visibility ?? 'PRIVATE');
  const [targetAllocationPercent, setTargetAllocationPercent] = useState(position?.targetAllocationPercent ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitPosition = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const validationError = validateInvestmentPositionForm({ instrument, targetAllocationPercent });
    if (validationError) {
      setError(validationError);
      return;
    }

    const normalizedTarget = targetAllocationPercent.trim() ? normalizeInvestmentDecimal(targetAllocationPercent, 2) : null;
    if (normalizedTarget === null && targetAllocationPercent.trim()) {
      setError(t.household.investing.validation.targetAllocation);
      return;
    }

    setSubmitting(true);
    const result = position
      ? await updateHouseholdInvestmentPosition(householdId, position.id, { wrapper, instrument: instrument.trim(), visibility, targetAllocationPercent: normalizedTarget }).catch((submitError: Error) => submitError)
      : await createHouseholdInvestmentPosition(householdId, { wrapper, instrument: instrument.trim(), visibility, targetAllocationPercent: normalizedTarget }).catch((submitError: Error) => submitError);
    setSubmitting(false);

    if (result instanceof Error) {
      setError(result.message);
      return;
    }

    router.push(`/household/investing/${result.id}`);
    router.refresh();
  };

  const archivePosition = async () => {
    if (!position || !window.confirm(t.household.investing.archiveConfirm)) return;
    setError(null);
    setSubmitting(true);
    const result = await updateHouseholdInvestmentPosition(householdId, position.id, { archive: true }).catch((submitError: Error) => submitError);
    setSubmitting(false);
    if (result instanceof Error) {
      setError(result.message);
      return;
    }
    router.push('/household/investing');
    router.refresh();
  };

  return (
    <form onSubmit={submitPosition} className="space-y-6">
      {error ? <ErrorState message={error} /> : null}
      <Surface className="space-y-5 p-5 sm:p-6">
        <FormField label={t.household.investing.fields.instrument} htmlFor="investment-instrument" required>
          <Input id="investment-instrument" value={instrument} onChange={(event) => setInstrument(event.target.value)} autoComplete="off" aria-describedby="investment-form-help investment-form-error" aria-invalid={Boolean(error)} />
        </FormField>

        <div>
          <p className="text-sm font-semibold text-foreground">{t.household.investing.fields.wrapper}</p>
          <div role="group" aria-label={t.household.investing.fields.wrapper} className="mt-3 grid gap-2 sm:grid-cols-3">
            {wrappers.map((value) => (
              <button key={value} type="button" aria-pressed={wrapper === value} onClick={() => setWrapper(value)} className={cn('min-h-14 rounded-control border px-3 py-2 text-left transition', wrapper === value ? 'border-primary bg-primary-soft text-foreground' : 'border-outline-control bg-surface-raised text-foreground-secondary hover:text-foreground')}>
                <span className="block text-sm font-semibold">{t.household.investing.wrapperLabels[value]}</span>
                <span className="mt-1 block text-xs text-muted">{t.household.investing.wrapperDescriptions[value]}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-foreground">{t.household.investing.fields.visibility}</p>
          <div role="group" aria-label={t.household.investing.fields.visibility} className="mt-3 grid gap-2 sm:grid-cols-2">
            {visibilities.map((value) => (
              <button key={value} type="button" aria-pressed={visibility === value} onClick={() => setVisibility(value)} className={cn('min-h-11 rounded-control border px-3 text-left text-sm transition', visibility === value ? 'border-primary bg-primary-soft font-semibold text-foreground' : 'border-outline-control bg-surface-raised text-foreground-secondary hover:text-foreground')}>
                {t.household.investing.visibilityLabels[value]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">Pozycja wspólna jest widoczna domownikom, ale jej zmiany nadal może wykonać tylko właściciel.</p>
        </div>

        <FormField label={t.household.investing.fields.targetAllocation} htmlFor="investment-target-allocation" hint="Opcjonalne. Backend wylicza odchylenie dopiero dla kompletnej alokacji 100%. ">
          <div className="relative max-w-xs">
            <Input id="investment-target-allocation" value={targetAllocationPercent} onChange={(event) => setTargetAllocationPercent(event.target.value)} inputMode="decimal" placeholder="0,00" className="pr-10" aria-describedby="investment-form-help investment-form-error" aria-invalid={Boolean(error)} />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">%</span>
          </div>
        </FormField>
        <p id="investment-form-help" className="text-sm text-muted">{t.household.investing.formDescription}</p>
        {error ? <p id="investment-form-error" className="sr-only">{error}</p> : null}
      </Surface>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap justify-end gap-3 border-t border-outline bg-background px-1 py-4 sm:static sm:border-0 sm:bg-transparent sm:p-0">
        {position && !position.archivedAt ? <Button type="button" variant="danger" onClick={archivePosition} disabled={submitting}>{t.household.investing.archive}</Button> : null}
        <Button type="button" variant="secondary" href={position ? `/household/investing/${position.id}` : '/household/investing'}>{t.household.investing.cancel}</Button>
        <Button type="submit" disabled={submitting}>{submitting ? t.household.investing.saving : t.household.investing.save}</Button>
      </div>
      {position?.archivedAt ? <Badge tone="warning">{t.household.investing.archived}</Badge> : null}
    </form>
  );
}

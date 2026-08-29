'use client';

import { useState } from 'react';
import { buildHouseholdReportQuery, type HouseholdReportPeriod, validateHouseholdReportDateRange } from '../../lib/household-report-period';
import { t } from '../../lib/phase3-translations';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { Surface } from '../atoms/Surface';

interface ReportPeriodControlProps {
  period: HouseholdReportPeriod;
}

export function ReportPeriodControl({ period }: ReportPeriodControlProps) {
  const [preset, setPreset] = useState(period.preset);
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const [error, setError] = useState<string | null>(null);

  const applyPeriod = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (preset === 'custom') {
      const validationError = validateHouseholdReportDateRange(from, to);
      if (validationError) {
        setError(t.household.reports.invalidPeriod);
        return;
      }
    }
    window.location.assign(`/household/reports?${buildHouseholdReportQuery({ preset, from, to })}`);
  };

  return (
    <Surface className="p-4 sm:p-5">
      <form onSubmit={applyPeriod} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <div className="space-y-2">
          <label htmlFor="report-period-preset" className="block text-sm font-semibold text-foreground">{t.household.reports.periodPreset}</label>
          <select id="report-period-preset" value={preset} onChange={(event) => setPreset(event.target.value as HouseholdReportPeriod['preset'])} className="h-11 w-full rounded-control border border-outline-control bg-surface-raised px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary">
            {(Object.keys(t.household.reports.presets) as HouseholdReportPeriod['preset'][]).map((value) => <option key={value} value={value}>{t.household.reports.presets[value]}</option>)}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 sm:col-span-1">
          <div className="space-y-2">
            <label htmlFor="report-period-from" className="block text-sm font-semibold text-foreground">{t.household.reports.from}</label>
            <Input id="report-period-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} disabled={preset !== 'custom'} aria-describedby="report-period-error" aria-invalid={Boolean(error)} />
          </div>
          <div className="space-y-2">
            <label htmlFor="report-period-to" className="block text-sm font-semibold text-foreground">{t.household.reports.to}</label>
            <Input id="report-period-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} disabled={preset !== 'custom'} aria-describedby="report-period-error" aria-invalid={Boolean(error)} />
          </div>
        </div>
        <Button type="submit">{t.household.reports.applyPeriod}</Button>
        {error ? <p id="report-period-error" className="text-sm text-error-ink sm:col-span-3" role="alert">{error}</p> : null}
      </form>
    </Surface>
  );
}

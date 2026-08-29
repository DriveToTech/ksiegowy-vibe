'use client';

import { useState } from 'react';
import { downloadHouseholdReport } from '../../lib/api-client';
import { t } from '../../lib/phase3-translations';
import { Button } from '../atoms/Button';
import { Surface } from '../atoms/Surface';

interface HouseholdReportExportActionsProps {
  householdId: string;
  from: string;
  to: string;
}

export function HouseholdReportExportActions({ householdId, from, to }: HouseholdReportExportActionsProps) {
  const [formatBeingExported, setFormatBeingExported] = useState<'csv' | 'pdf' | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const download = async (format: 'csv' | 'pdf') => {
    setStatus(null);
    setFormatBeingExported(format);
    const report = await downloadHouseholdReport(householdId, from, to, format).catch(() => null);
    setFormatBeingExported(null);
    if (!report) {
      setStatus(t.household.reports.exportFailure);
      return;
    }

    const objectUrl = URL.createObjectURL(report);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `household-report-${from}-${to}.${format}`;
    link.click();
    URL.revokeObjectURL(objectUrl);
    setStatus(t.household.reports.exportSuccess(format.toUpperCase()));
  };

  return (
    <Surface className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t.household.reports.exportTitle}</h2>
        <p className="mt-1 text-sm text-muted">Eksport korzysta z aktualnego, zweryfikowanego zakresu: {from}–{to}.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => download('csv')} disabled={formatBeingExported !== null}>
          {formatBeingExported === 'csv' ? t.household.reports.exporting : t.household.reports.exportCsv}
        </Button>
        <Button type="button" onClick={() => download('pdf')} disabled={formatBeingExported !== null}>
          {formatBeingExported === 'pdf' ? t.household.reports.exporting : t.household.reports.exportPdf}
        </Button>
      </div>
      <p className="basis-full text-sm text-muted" aria-live="polite">{status}</p>
    </Surface>
  );
}

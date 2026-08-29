import { getHouseholdReportSummary, getHouseholdTaxReturnReport } from '../../../../lib/api';
import { requireAuthSession } from '../../../../lib/auth';
import { formatDate, formatMoney } from '../../../../lib/format';
import { parseHouseholdReportPeriod } from '../../../../lib/household-report-period';
import { t } from '../../../../lib/phase3-translations';
import { Badge } from '../../../../components/atoms/Badge';
import { Surface } from '../../../../components/atoms/Surface';
import { ErrorState } from '../../../../components/molecules/ErrorState';
import { PageHeader } from '../../../../components/molecules/PageHeader';
import { HouseholdReportExportActions } from '../../../../components/organisms/HouseholdReportExportActions';
import { ReportPeriodControl } from '../../../../components/organisms/ReportPeriodControl';

export default async function HouseholdReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireAuthSession('/household/reports');
  const householdId = session.activeHouseholdId as string;
  const query = await searchParams;
  const parsedPeriod = parseHouseholdReportPeriod(query);
  const displayPeriod = parsedPeriod.period ?? parseHouseholdReportPeriod({}).period!;

  if (parsedPeriod.error) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={t.household.reports.pageEyebrow} title={t.household.reports.pageTitle} description={t.household.reports.pageDescription} />
        <ReportPeriodControl period={displayPeriod} />
        <ErrorState message={t.household.reports.invalidPeriod} />
      </div>
    );
  }

  const period = parsedPeriod.period!;
  const report = await getHouseholdReportSummary(householdId, period.from, period.to).catch(() => null);
  const taxReport = report ? await getHouseholdTaxReturnReport(householdId, report.from, report.to).catch(() => null) : null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.household.reports.pageEyebrow} title={t.household.reports.pageTitle} description={t.household.reports.pageDescription} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-card border border-primary/30 bg-primary-soft p-4 text-sm text-foreground"><strong className="block">Dane ręczne</strong><span>{t.household.reports.manualDisclosure}</span></div>
        <div className="rounded-card border border-outline bg-surface-raised p-4 text-sm text-foreground">{t.household.reports.visibleScope}</div>
      </div>
      <ReportPeriodControl period={period} />

      {!report ? <ErrorState message={t.household.reports.reportLoadFailure} /> : (
        <>
          <p className="text-sm text-muted">Raport serwerowy: {formatDate(report.from)}–{formatDate(report.to)}. Wartości poniżej pochodzą z kanonicznego DTO backendu.</p>
          <HouseholdReportExportActions householdId={householdId} from={report.from} to={report.to} />
          <CashFlowSection report={report} />
          <CategoryComparisonSection report={report} />
          <NetWorthSection report={report} />
          <DataQualitySection report={report} />
          <TaxEvidenceSection report={taxReport} />
        </>
      )}
    </div>
  );
}

function CashFlowSection({ report }: { report: Awaited<ReturnType<typeof getHouseholdReportSummary>> }) {
  return (
    <section aria-labelledby="household-report-cash-flow" className="space-y-3">
      <h2 id="household-report-cash-flow" className="text-base font-semibold text-foreground">{t.household.reports.cashFlowTitle}</h2>
      <Surface className="space-y-4 p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-3"><ReportMetric label={t.household.reports.income} value={formatMoney(report.cashFlow.income)} /><ReportMetric label={t.household.reports.spending} value={formatMoney(report.cashFlow.spending)} /><ReportMetric label={t.household.reports.surplus} value={formatMoney(report.cashFlow.surplus)} /></div>
        <div className="overflow-x-auto border-t border-outline pt-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">{t.household.reports.categoryTitle}</h3>
          <table className="w-full min-w-[520px] text-left text-sm"><caption className="sr-only">Wpływy i wydatki według kategorii</caption><thead className="border-b border-outline text-xs text-muted"><tr><th scope="col" className="px-3 py-2">{t.household.reports.category}</th><th scope="col" className="px-3 py-2">{t.household.reports.income}</th><th scope="col" className="px-3 py-2">{t.household.reports.spending}</th></tr></thead><tbody className="divide-y divide-outline">{report.cashFlow.categories.length === 0 ? <tr><td colSpan={3} className="px-3 py-4 text-muted">Brak danych w tym okresie.</td></tr> : report.cashFlow.categories.map((category) => <tr key={category.categoryId ?? 'uncategorized'}><th scope="row" className="px-3 py-2 font-medium text-foreground">{category.categoryName}</th><td className="px-3 py-2 tabular-nums">{formatMoney(category.income)}</td><td className="px-3 py-2 tabular-nums">{formatMoney(category.spending)}</td></tr>)}</tbody></table>
        </div>
      </Surface>
    </section>
  );
}

function CategoryComparisonSection({ report }: { report: Awaited<ReturnType<typeof getHouseholdReportSummary>> }) {
  return (
    <section aria-labelledby="household-report-comparison" className="space-y-3">
      <div><h2 id="household-report-comparison" className="text-base font-semibold text-foreground">{t.household.reports.comparisonTitle}</h2><p className="mt-1 text-sm text-muted">{t.household.reports.comparisonBasis}: {formatDate(report.categoryComparison.from)}–{formatDate(report.categoryComparison.to)}.</p></div>
      <Surface className="overflow-x-auto p-0"><table className="w-full min-w-[900px] text-left text-sm"><caption className="sr-only">Porównanie wpływów i wydatków według kategorii</caption><thead className="border-b border-outline bg-surface-raised text-xs text-muted"><tr><th scope="col" className="px-4 py-3">{t.household.reports.category}</th><th scope="col" className="px-4 py-3">{t.household.reports.current} · {t.household.reports.income}</th><th scope="col" className="px-4 py-3">{t.household.reports.prior} · {t.household.reports.income}</th><th scope="col" className="px-4 py-3">{t.household.reports.delta}</th><th scope="col" className="px-4 py-3">{t.household.reports.current} · {t.household.reports.spending}</th><th scope="col" className="px-4 py-3">{t.household.reports.prior} · {t.household.reports.spending}</th><th scope="col" className="px-4 py-3">{t.household.reports.delta}</th></tr></thead><tbody className="divide-y divide-outline">{report.categoryComparison.categories.length === 0 ? <tr><td colSpan={7} className="px-4 py-4 text-muted">Brak danych porównawczych.</td></tr> : report.categoryComparison.categories.map((category) => <tr key={category.categoryName}><th scope="row" className="px-4 py-3 font-medium text-foreground">{category.categoryName}</th><td className="px-4 py-3 tabular-nums">{formatMoney(category.currentIncome)}</td><td className="px-4 py-3 tabular-nums">{formatMoney(category.priorIncome)}</td><td className="px-4 py-3 tabular-nums">{formatMoney(category.incomeDelta)}</td><td className="px-4 py-3 tabular-nums">{formatMoney(category.currentSpending)}</td><td className="px-4 py-3 tabular-nums">{formatMoney(category.priorSpending)}</td><td className="px-4 py-3 tabular-nums">{formatMoney(category.spendingDelta)}</td></tr>)}</tbody></table></Surface>
    </section>
  );
}

function NetWorthSection({ report }: { report: Awaited<ReturnType<typeof getHouseholdReportSummary>> }) {
  return (
    <section aria-labelledby="household-report-net-worth" className="space-y-3">
      <h2 id="household-report-net-worth" className="text-base font-semibold text-foreground">{t.household.reports.netWorthTitle}</h2>
      <Surface className="space-y-5 p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-3"><ReportMetric label={t.household.reports.total} value={formatMoney(report.netWorth.total)} /><ReportMetric label={t.household.reports.accounts} value={formatMoney(report.netWorth.components.accounts)} /><ReportMetric label={t.household.reports.investments} value={formatMoney(report.netWorth.components.investments)} /></div>
        <div className="grid gap-5 border-t border-outline pt-4 xl:grid-cols-2"><NetWorthTable title={t.household.reports.accounts} rows={report.netWorth.accounts.map((account) => ({ name: account.name, value: account.value, completeness: account.completeness, detail: `Saldo początkowe od ${formatDate(account.openingBalanceBoundary)}` }))} /><NetWorthTable title={t.household.reports.investments} rows={report.netWorth.investments.map((investment) => ({ name: `${investment.instrument} · ${investment.wrapper}`, value: investment.value, completeness: investment.completeness, detail: investment.valuationDate ? `${t.household.reports.valuationDate}: ${formatDate(investment.valuationDate)}` : t.household.reports.noValuation }))} /></div>
      </Surface>
    </section>
  );
}

function NetWorthTable({ title, rows }: { title: string; rows: Array<{ name: string; value: string | null; completeness: 'COMPLETE' | 'PARTIAL'; detail: string }> }) {
  return <div><h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3><div className="space-y-2">{rows.length === 0 ? <p className="text-sm text-muted">Brak danych.</p> : rows.map((row, index) => <div key={`${row.name}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-inset bg-surface-raised px-3 py-3 text-sm"><div><p className="font-medium text-foreground">{row.name}</p><p className="mt-1 text-xs text-muted">{row.detail}</p></div><div className="flex items-center gap-2"><Badge tone={row.completeness === 'COMPLETE' ? 'success' : 'warning'}>{row.completeness === 'COMPLETE' ? t.household.reports.complete : t.household.reports.partial}</Badge><span className="tabular-nums text-foreground">{row.value === null ? t.household.reports.noValuation : formatMoney(row.value)}</span></div></div>)}</div></div>;
}

function DataQualitySection({ report }: { report: Awaited<ReturnType<typeof getHouseholdReportSummary>> }) {
  return <Surface className="space-y-3 p-5 sm:p-6"><div className="flex flex-wrap items-center gap-3"><h2 className="text-base font-semibold text-foreground">{t.household.reports.qualityTitle}</h2><Badge tone={report.dataQuality.status === 'COMPLETE' ? 'success' : 'warning'}>{report.dataQuality.status === 'COMPLETE' ? t.household.reports.complete : t.household.reports.partial}</Badge></div><p className="text-sm text-foreground">{report.dataQuality.status === 'COMPLETE' ? t.household.reports.qualityComplete : t.household.reports.qualityPartial}</p><ul className="list-disc space-y-1 pl-5 text-sm text-muted">{report.dataQuality.notes.map((note) => <li key={note}>{note}</li>)}<li>Widoczne tylko: {report.dataQuality.visibleOnly ? 'tak' : 'nie'}.</li></ul></Surface>;
}

function TaxEvidenceSection({ report }: { report: Awaited<ReturnType<typeof getHouseholdTaxReturnReport>> | null }) {
  return <details className="rounded-card border border-outline bg-surface-panel p-5 sm:p-6"><summary className="cursor-pointer text-base font-semibold text-foreground">{t.household.reports.taxTitle}</summary><p className="mt-3 text-sm text-muted">{t.household.reports.taxDisclosure}</p>{!report ? <p className="mt-4 text-sm text-muted">Dane informacyjne są chwilowo niedostępne.</p> : report.ikzeContributions.length === 0 ? <p className="mt-4 text-sm text-muted">{t.household.reports.taxEmpty}</p> : <><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[500px] text-left text-sm"><caption className="sr-only">Informacyjne dowody wpłat IKZE</caption><thead className="border-b border-outline text-xs text-muted"><tr><th scope="col" className="px-3 py-2">{t.household.reports.taxDate}</th><th scope="col" className="px-3 py-2">{t.household.reports.taxInstrument}</th><th scope="col" className="px-3 py-2">{t.household.reports.taxAmount}</th></tr></thead><tbody className="divide-y divide-outline">{report.ikzeContributions.map((contribution) => <tr key={`${contribution.positionId}-${contribution.date}`}><td className="px-3 py-2">{formatDate(contribution.date)}</td><th scope="row" className="px-3 py-2 font-medium text-foreground">{contribution.instrument}</th><td className="px-3 py-2 tabular-nums">{formatMoney(contribution.amount)}</td></tr>)}</tbody></table></div><p className="mt-4 text-sm font-semibold text-foreground">{t.household.reports.taxTotal}: {formatMoney(report.totalIkzeContributions)}</p></>}</details>;
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-inset bg-surface-raised p-4"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p></div>;
}

import Link from 'next/link';
import { getHouseholdInvestmentPortfolio, getHouseholdInvestmentValueHistory } from '../../../../lib/api';
import { requireAuthSession } from '../../../../lib/auth';
import { formatDate, formatMoney, formatPercentage, formatSignedPercentagePoints } from '../../../../lib/format';
import { t } from '../../../../lib/phase3-translations';
import { Badge } from '../../../../components/atoms/Badge';
import { Button } from '../../../../components/atoms/Button';
import { Surface } from '../../../../components/atoms/Surface';
import { EmptyState } from '../../../../components/molecules/EmptyState';
import { ErrorState } from '../../../../components/molecules/ErrorState';
import { PageHeader } from '../../../../components/molecules/PageHeader';

export default async function HouseholdInvestingPage() {
  const session = await requireAuthSession('/household/investing');
  const householdId = session.activeHouseholdId as string;
  const portfolio = await getHouseholdInvestmentPortfolio(householdId).catch(() => null);
  const history = portfolio ? await getHouseholdInvestmentValueHistory(householdId).catch(() => null) : null;

  if (!portfolio) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={t.household.investing.pageEyebrow} title={t.household.investing.pageTitle} />
        <ErrorState message="Nie udało się wczytać inwestycji. Spróbuj ponownie później." />
      </div>
    );
  }

  const targetHint = portfolio.targetAllocation.status === 'COMPLETE'
    ? portfolio.missingValuationCount > 0 ? t.household.investing.targetMissingHint : null
    : portfolio.targetAllocation.status === 'INCOMPLETE' ? t.household.investing.targetIncompleteHint : t.household.investing.targetNoneHint;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.household.investing.pageEyebrow}
        title={t.household.investing.pageTitle}
        description={t.household.investing.pageDescription}
        actions={<Button href="/household/investing/new">{t.household.investing.addPosition}</Button>}
      />

      <div className="rounded-card border border-primary/30 bg-primary-soft p-4 text-sm text-foreground sm:p-5">
        <strong className="block">Dane ręczne</strong>
        <span>{t.household.investing.manualDisclosure}</span>
      </div>

      <Surface className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">{t.household.investing.summaryTitle}</h2>
          <Badge tone={portfolio.dataQuality === 'COMPLETE' ? 'success' : 'warning'}>{portfolio.dataQuality === 'COMPLETE' ? t.household.investing.complete : t.household.investing.partial}</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryMetric label={t.household.investing.totalValue} value={formatMoney(portfolio.totalCurrentValue)} />
          <SummaryMetric label={t.household.investing.valuedValue} value={formatMoney(portfolio.valuedCurrentValue)} />
          <SummaryMetric label={t.household.investing.missingValuations} value={String(portfolio.missingValuationCount)} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-outline pt-3 text-sm">
          <span className="font-semibold text-foreground">{t.household.investing.targetStatus[portfolio.targetAllocation.status]}</span>
          <span className="text-muted">{t.household.investing.targetTotal(formatPercentage(portfolio.targetAllocation.totalPercent, 2, 2))}</span>
        </div>
        {targetHint ? <p className="text-sm text-muted">{targetHint}</p> : null}
        {portfolio.missingValuationCount > 0 ? <p className="text-sm text-warning-ink">Wartość i alokacja są częściowe, ponieważ backend nie ma wyceny dla wszystkich widocznych pozycji.</p> : null}
      </Surface>

      {portfolio.positions.length === 0 ? (
        <EmptyState title={t.household.investing.emptyTitle} description={t.household.investing.emptyDescription} action={<Button href="/household/investing/new">{t.household.investing.addPosition}</Button>} />
      ) : (
        <section aria-labelledby="investment-positions-title" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="investment-positions-title" className="text-base font-semibold text-foreground">{t.household.investing.positionsTitle}</h2>
            <Link href="/household/investing/contributions" className="text-sm font-semibold text-primary-strong hover:text-primary">{t.household.investing.contributionsLink}</Link>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {portfolio.positions.map((item) => <InvestmentPositionCard key={item.position.id} item={item} currentUserId={session.user?.id ?? ''} />)}
          </div>
        </section>
      )}

      <section aria-labelledby="investment-allocation-title" className="space-y-3">
        <div>
          <h2 id="investment-allocation-title" className="text-base font-semibold text-foreground">Alokacja i odchylenie</h2>
          <p className="mt-1 text-sm text-muted">Odchylenie jest podpisane w punktach procentowych i pochodzi z DTO backendu.</p>
        </div>
        <Surface className="overflow-x-auto p-0">
          <table className="w-full min-w-[700px] text-left text-sm">
            <caption className="sr-only">Alokacja bieżąca, cel i podpisane odchylenie pozycji inwestycyjnych</caption>
            <thead className="border-b border-outline bg-surface-raised text-xs text-muted">
              <tr><th scope="col" className="px-4 py-3">{t.household.investing.positionInstrument}</th><th scope="col" className="px-4 py-3">{t.household.investing.positionAllocation}</th><th scope="col" className="px-4 py-3">{t.household.investing.positionTarget}</th><th scope="col" className="px-4 py-3">{t.household.investing.positionDrift}</th></tr>
            </thead>
            <tbody className="divide-y divide-outline">
              {portfolio.positions.map(({ position, currentAllocationPercent, driftPercent }) => (
                <tr key={position.id}>
                  <th scope="row" className="px-4 py-3 font-semibold text-foreground">{position.instrument}</th>
                  <td className="px-4 py-3 tabular-nums">{currentAllocationPercent === null ? t.household.investing.missingValuation : formatPercentage(currentAllocationPercent, 2, 2)}</td>
                  <td className="px-4 py-3 tabular-nums">{position.targetAllocationPercent === null ? '—' : formatPercentage(position.targetAllocationPercent, 2, 2)}</td>
                  <td className="px-4 py-3">{driftPercent === null ? <span className="text-muted">— · brak pełnych danych</span> : <DriftValue value={driftPercent} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Surface>
      </section>

      <section aria-labelledby="investment-history-title" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 id="investment-history-title" className="text-base font-semibold text-foreground">{t.household.investing.valueHistoryTitle}</h2>
            <p className="mt-1 text-sm text-muted">Historia zawiera wyłącznie zapisane przez użytkownika aktualizacje wyceny.</p>
          </div>
          <Link href="/household/investing/contributions" className="text-sm font-semibold text-primary-strong hover:text-primary">{t.household.investing.contributionsLink}</Link>
        </div>
        {!history ? <ErrorState message="Historia wycen jest chwilowo niedostępna." /> : history.data.length === 0 ? <EmptyState title={t.household.investing.valueHistoryEmpty} description={t.household.investing.valueHistoryEmptyDescription} /> : <ValueHistoryTable history={history.data} />}
        {history?.missingValuationPositionIds.length ? <p className="text-sm text-warning-ink">{t.household.investing.valueHistoryMissing}</p> : null}
      </section>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-inset bg-surface-raised p-4"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p></div>;
}

function InvestmentPositionCard({ item, currentUserId }: { item: Awaited<ReturnType<typeof getHouseholdInvestmentPortfolio>>['positions'][number]; currentUserId: string }) {
  const { position } = item;
  return (
    <Surface className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/household/investing/${position.id}`} className="block truncate text-base font-semibold text-foreground hover:text-primary-strong">{position.instrument}</Link>
          <p className="mt-1 text-sm text-muted">{t.household.investing.wrapperLabels[position.wrapper]} · {position.visibility === 'SHARED' ? t.household.investing.shared : t.household.investing.private}</p>
        </div>
        <Badge tone={position.currentValue === null ? 'warning' : 'success'}>{position.currentValue === null ? t.household.investing.missingValuation : formatMoney(position.currentValue)}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Metric label={t.household.investing.positionUnits} value={position.units} />
        <Metric label={t.household.investing.positionCostBasis} value={formatMoney(position.costBasis)} />
        <Metric label={t.household.investing.positionAllocation} value={item.currentAllocationPercent === null ? '—' : formatPercentage(item.currentAllocationPercent, 2, 2)} />
        <Metric label={t.household.investing.positionDrift} value={item.driftPercent === null ? '—' : formatSignedPercentagePoints(item.driftPercent)} />
      </dl>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-outline pt-3 text-xs text-muted">
        <span>{t.household.investing.positionOwner}: {position.ownerUserId === currentUserId ? t.household.investing.ownerYou : t.household.investing.ownerOther}</span>
        <span>{position.lastValuedAt ? `Ostatnia wycena: ${formatDate(position.lastValuedAt)}` : t.household.investing.missingValuation}</span>
      </div>
    </Surface>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 tabular-nums text-foreground">{value}</dd></div>;
}

function DriftValue({ value }: { value: string }) {
  const number = Number(value);
  const label = number > 0 ? t.household.investing.excess : number < 0 ? t.household.investing.shortfall : t.household.investing.balanced;
  return <span className="font-semibold tabular-nums text-foreground">{label}: {formatSignedPercentagePoints(value)}</span>;
}

function ValueHistoryTable({ history }: { history: Awaited<ReturnType<typeof getHouseholdInvestmentValueHistory>>['data'] }) {
  return (
    <Surface className="overflow-x-auto p-0">
      <table className="w-full min-w-[620px] text-left text-sm">
        <caption className="sr-only">Historia ręcznych aktualizacji wycen</caption>
        <thead className="border-b border-outline bg-surface-raised text-xs text-muted"><tr><th scope="col" className="px-4 py-3">{t.household.investing.valueHistoryDate}</th><th scope="col" className="px-4 py-3">{t.household.investing.valueHistoryInstrument}</th><th scope="col" className="px-4 py-3">{t.household.investing.valueHistoryWrapper}</th><th scope="col" className="px-4 py-3">{t.household.investing.valueHistoryValue}</th></tr></thead>
        <tbody className="divide-y divide-outline">{history.map((point) => <tr key={point.transactionId}><td className="px-4 py-3">{formatDate(point.date)}</td><th scope="row" className="px-4 py-3 font-semibold text-foreground">{point.instrument}</th><td className="px-4 py-3">{t.household.investing.wrapperLabels[point.wrapper]}</td><td className="px-4 py-3 tabular-nums">{formatMoney(point.value)}</td></tr>)}</tbody>
      </table>
    </Surface>
  );
}

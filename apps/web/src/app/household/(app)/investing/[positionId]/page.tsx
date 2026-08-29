import Link from 'next/link';
import { getHouseholdInvestmentPortfolio, getHouseholdInvestmentTransactions } from '../../../../../lib/api';
import { requireAuthSession } from '../../../../../lib/auth';
import { formatDate, formatMoney } from '../../../../../lib/format';
import { t } from '../../../../../lib/phase3-translations';
import { Badge } from '../../../../../components/atoms/Badge';
import { Button } from '../../../../../components/atoms/Button';
import { Surface } from '../../../../../components/atoms/Surface';
import { ErrorState } from '../../../../../components/molecules/ErrorState';
import { PageHeader } from '../../../../../components/molecules/PageHeader';
import { InvestmentVoidAction } from '../../../../../components/organisms/InvestmentVoidAction';

export default async function HouseholdInvestmentDetailPage({ params }: { params: Promise<{ positionId: string }> }) {
  const { positionId } = await params;
  const session = await requireAuthSession(`/household/investing/${positionId}`);
  const householdId = session.activeHouseholdId as string;
  const result = await Promise.all([
    getHouseholdInvestmentPortfolio(householdId),
    getHouseholdInvestmentTransactions(householdId, positionId),
  ]).catch(() => null);

  const positionItem = result?.[0].positions.find((item) => item.position.id === positionId);
  if (!result || !positionItem) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={t.household.investing.pageTitle} title={t.household.investing.positionDetail} />
        <ErrorState message="Nie znaleziono pozycji inwestycyjnej lub nie masz do niej dostępu." />
      </div>
    );
  }

  const transactions = result[1];
  const { position, currentAllocationPercent, driftPercent } = positionItem;
  const isOwner = position.ownerUserId === session.user?.id;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.household.investing.pageTitle} eyebrowHref="/household/investing" title={position.instrument} actions={isOwner && !position.archivedAt ? <><Button href={`/household/investing/${position.id}/transactions/new`}>{t.household.investing.addTransaction}</Button><Button href={`/household/investing/${position.id}/edit`} variant="secondary">{t.household.investing.editPosition}</Button></> : null} />
      {position.archivedAt ? <div className="rounded-card border border-warning/40 bg-warning px-4 py-3 text-sm text-warning-ink">{t.household.investing.archived}</div> : null}
      {!isOwner ? <div className="rounded-card border border-outline bg-surface-raised px-4 py-3 text-sm text-muted">Pozycja jest dostępna do podglądu. Backend wymaga właściciela dla zmian, także dla pozycji wspólnych.</div> : null}

      <Surface className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-sm text-muted">{t.household.investing.wrapperLabels[position.wrapper]} · {position.visibility === 'SHARED' ? t.household.investing.shared : t.household.investing.private}</p><p className="mt-1 text-xs text-muted">{t.household.investing.positionOwner}: {isOwner ? t.household.investing.ownerYou : t.household.investing.ownerOther}</p></div>
          <Badge tone={position.currentValue === null ? 'warning' : 'success'}>{position.currentValue === null ? t.household.investing.missingValuation : formatMoney(position.currentValue)}</Badge>
        </div>
        <dl className="grid gap-4 sm:grid-cols-3">
          <DetailMetric label={t.household.investing.positionUnits} value={position.units} />
          <DetailMetric label={t.household.investing.positionCostBasis} value={formatMoney(position.costBasis)} />
          <DetailMetric label={t.household.investing.positionValue} value={position.currentValue === null ? t.household.investing.missingValuation : formatMoney(position.currentValue)} />
          <DetailMetric label={t.household.investing.positionTarget} value={position.targetAllocationPercent === null ? '—' : `${position.targetAllocationPercent}%`} />
          <DetailMetric label={t.household.investing.positionAllocation} value={currentAllocationPercent === null ? '—' : `${currentAllocationPercent}%`} />
          <DetailMetric label={t.household.investing.positionDrift} value={driftPercent === null ? '—' : `${driftPercent} p.p.`} />
        </dl>
        <p className="border-t border-outline pt-3 text-sm text-muted">{position.lastValuedAt ? `Ostatnia wycena: ${formatDate(position.lastValuedAt)}` : t.household.investing.missingValuation}</p>
      </Surface>

      <section aria-labelledby="investment-transactions-title" className="space-y-3">
        <h2 id="investment-transactions-title" className="text-base font-semibold text-foreground">{t.household.investing.transactionsTitle}</h2>
        {transactions.length === 0 ? <Surface className="p-6"><p className="font-semibold text-foreground">{t.household.investing.transactionsEmpty}</p><p className="mt-1 text-sm text-muted">{t.household.investing.transactionsEmptyDescription}</p></Surface> : (
          <Surface className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">Operacje pozycji inwestycyjnej</caption>
              <thead className="border-b border-outline bg-surface-raised text-xs text-muted"><tr><th scope="col" className="px-4 py-3">{t.household.investing.transactionDate}</th><th scope="col" className="px-4 py-3">{t.household.investing.transactionType}</th><th scope="col" className="px-4 py-3">{t.household.investing.transactionAmount}</th><th scope="col" className="px-4 py-3">{t.household.investing.transactionUnits}</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3">Akcja</th></tr></thead>
              <tbody className="divide-y divide-outline">{transactions.map((transaction) => <tr key={transaction.id} className={transaction.voidedAt ? 'text-muted' : undefined}><td className="px-4 py-3">{formatDate(transaction.date)}</td><td className="px-4 py-3 font-semibold">{t.household.investing.types[transaction.type]}</td><td className="px-4 py-3 tabular-nums">{formatMoney(transaction.amount)}</td><td className="px-4 py-3 tabular-nums">{transaction.units ?? '—'}</td><td className="px-4 py-3">{transaction.voidedAt ? <Badge tone="warning">{t.household.investing.voided}</Badge> : <Badge tone="success">Aktywna</Badge>}</td><td className="px-4 py-3">{isOwner && !transaction.voidedAt && !position.archivedAt ? <InvestmentVoidAction householdId={householdId} positionId={position.id} transactionId={transaction.id} /> : '—'}</td></tr>)}</tbody>
            </table>
          </Surface>
        )}
      </section>
      <Link href="/household/investing/contributions" className="inline-flex min-h-11 items-center font-semibold text-primary-strong hover:text-primary">{t.household.investing.contributionsLink}</Link>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-base font-semibold tabular-nums text-foreground">{value}</dd></div>;
}

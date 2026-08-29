import Link from 'next/link';
import { getHouseholdInvestmentContributions, getHouseholdInvestmentPortfolio } from '../../../../../lib/api';
import { requireAuthSession } from '../../../../../lib/auth';
import { formatDate, formatMoney } from '../../../../../lib/format';
import { t } from '../../../../../lib/phase3-translations';
import { Badge } from '../../../../../components/atoms/Badge';
import { Button } from '../../../../../components/atoms/Button';
import { Input } from '../../../../../components/atoms/Input';
import { Surface } from '../../../../../components/atoms/Surface';
import { EmptyState } from '../../../../../components/molecules/EmptyState';
import { ErrorState } from '../../../../../components/molecules/ErrorState';
import { PageHeader } from '../../../../../components/molecules/PageHeader';

export default async function HouseholdInvestmentContributionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireAuthSession('/household/investing/contributions');
  const householdId = session.activeHouseholdId as string;
  const query = await searchParams;
  const year = query.year === undefined || query.year === '' ? undefined : Number(query.year);

  if (year !== undefined && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
    return <ContributionsFrame><ErrorState message="Podaj rok od 2000 do 2100." /></ContributionsFrame>;
  }

  const result = await Promise.all([
    getHouseholdInvestmentContributions(householdId, year === undefined ? undefined : { year }),
    getHouseholdInvestmentPortfolio(householdId),
  ]).catch(() => null);
  if (!result) return <ContributionsFrame><ErrorState message="Nie udało się wczytać historii wpłat." /></ContributionsFrame>;

  const [contributions, portfolio] = result;
  const positionById = new Map(portfolio.positions.map((item) => [item.position.id, item.position]));
  const hasConfirmedIkzeLimit = contributions.annualLimit !== null
    && contributions.annualLimitSource !== null
    && contributions.annualLimitSource.trim().length > 0
    && contributions.annualLimitConfirmation === 'USER_CONFIRMED'
    && contributions.ikzeHeadroom !== null;

  return (
    <ContributionsFrame>
      <div className="rounded-card border border-primary/30 bg-primary-soft p-4 text-sm text-foreground sm:p-5">
        <strong className="block">Historia, nie harmonogram</strong>
        <span>{t.household.investing.contributionPageDescription}</span>
      </div>

      <Surface className="p-4 sm:p-5">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="space-y-2"><label htmlFor="contribution-year" className="block text-sm font-semibold text-foreground">{t.household.investing.contributionYear}</label><Input id="contribution-year" name="year" type="number" min="2000" max="2100" defaultValue={contributions.year ?? ''} placeholder={t.household.investing.allYears} className="w-40" /></div>
          <Button type="submit" variant="secondary">Pokaż historię</Button>
          <Link href="/household/investing/contributions" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-primary-strong">{t.household.investing.allYears}</Link>
        </form>
      </Surface>

      <Surface className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold text-foreground">{t.household.investing.contributionHistoryTitle}</h2><Badge tone="primary">{contributions.year === null ? t.household.investing.allYears : `Rok: ${contributions.year}`}</Badge></div>
        <div className="grid gap-3 sm:grid-cols-2"><SummaryMetric label={t.household.investing.contributionTotal} value={formatMoney(contributions.totalContribution)} /><SummaryMetric label={t.household.investing.ikzeContribution} value={formatMoney(contributions.ikzeContribution)} /></div>
        {hasConfirmedIkzeLimit ? <div className="grid gap-3 border-t border-outline pt-4 sm:grid-cols-3"><SummaryMetric label={t.household.investing.annualLimit} value={formatMoney(contributions.annualLimit!)} /><SummaryMetric label={t.household.investing.ikzeHeadroom} value={formatMoney(contributions.ikzeHeadroom!)} /><div><p className="text-xs text-muted">{t.household.investing.annualLimitSource}</p><p className="mt-1 text-sm text-foreground">{contributions.annualLimitSource}</p><p className="mt-1 text-xs text-muted">{t.household.investing.annualLimitConfirmed}</p></div></div> : <p className="border-t border-outline pt-4 text-sm text-muted">{t.household.investing.headroomUnavailable}</p>}
      </Surface>

      {contributions.data.length === 0 ? <EmptyState title={t.household.investing.contributionHistoryEmpty} description={t.household.investing.contributionHistoryEmptyDescription} /> : (
        <Surface className="overflow-x-auto p-0">
          <table className="w-full min-w-[800px] text-left text-sm">
            <caption className="sr-only">Zarejestrowana historia wpłat inwestycyjnych</caption>
            <thead className="border-b border-outline bg-surface-raised text-xs text-muted"><tr><th scope="col" className="px-4 py-3">Data</th><th scope="col" className="px-4 py-3">Instrument</th><th scope="col" className="px-4 py-3">Opakowanie</th><th scope="col" className="px-4 py-3">Właściciel</th><th scope="col" className="px-4 py-3">Kwota</th></tr></thead>
            <tbody className="divide-y divide-outline">{contributions.data.map((item) => { const position = positionById.get(item.positionId); return <tr key={item.transaction.id}><td className="px-4 py-3">{formatDate(item.transaction.date)}</td><th scope="row" className="px-4 py-3 font-semibold text-foreground"><Link href={`/household/investing/${item.positionId}`} className="hover:text-primary-strong">{item.instrument}</Link></th><td className="px-4 py-3">{t.household.investing.wrapperLabels[item.wrapper]}</td><td className="px-4 py-3">{position?.ownerUserId === session.user?.id ? t.household.investing.ownerYou : t.household.investing.ownerOther}</td><td className="px-4 py-3 tabular-nums">{formatMoney(item.transaction.amount)}</td></tr>; })}</tbody>
          </table>
        </Surface>
      )}
    </ContributionsFrame>
  );
}

function ContributionsFrame({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6"><PageHeader eyebrow={t.household.investing.pageTitle} eyebrowHref="/household/investing" title={t.household.investing.contributionPageTitle} description={t.household.investing.contributionPageDescription} />{children}</div>;
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-inset bg-surface-raised p-4"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p></div>;
}

import { getHouseholdInvestmentPortfolio } from '../../../../../../../lib/api';
import { requireAuthSession } from '../../../../../../../lib/auth';
import { t } from '../../../../../../../lib/phase3-translations';
import { ErrorState } from '../../../../../../../components/molecules/ErrorState';
import { PageHeader } from '../../../../../../../components/molecules/PageHeader';
import { InvestmentTransactionForm } from '../../../../../../../components/organisms/InvestmentTransactionForm';

export default async function NewHouseholdInvestmentTransactionPage({ params }: { params: Promise<{ positionId: string }> }) {
  const { positionId } = await params;
  const session = await requireAuthSession(`/household/investing/${positionId}/transactions/new`);
  const householdId = session.activeHouseholdId as string;
  const portfolio = await getHouseholdInvestmentPortfolio(householdId).catch(() => null);
  const position = portfolio?.positions.find((item) => item.position.id === positionId)?.position;

  if (!position) {
    return <div className="space-y-6"><PageHeader eyebrow={t.household.investing.pageTitle} title={t.household.investing.transactionPageTitle} /><ErrorState message="Nie znaleziono pozycji inwestycyjnej lub nie masz do niej dostępu." /></div>;
  }
  if (position.ownerUserId !== session.user?.id) {
    return <div className="space-y-6"><PageHeader eyebrow={position.instrument} eyebrowHref={`/household/investing/${position.id}`} title={t.household.investing.transactionPageTitle} /><ErrorState message="Tylko właściciel pozycji może rejestrować jej operacje. To ograniczenie jest egzekwowane przez backend." /></div>;
  }
  if (position.archivedAt) {
    return <div className="space-y-6"><PageHeader eyebrow={position.instrument} eyebrowHref={`/household/investing/${position.id}`} title={t.household.investing.transactionPageTitle} /><ErrorState message={t.household.investing.archived} /></div>;
  }

  return <div className="space-y-6"><PageHeader eyebrow={position.instrument} eyebrowHref={`/household/investing/${position.id}`} title={t.household.investing.transactionPageTitle} description={t.household.investing.transactionFormDescription} /><InvestmentTransactionForm householdId={householdId} position={position} /></div>;
}

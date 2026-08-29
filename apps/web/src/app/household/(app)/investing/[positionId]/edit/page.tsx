import { getHouseholdInvestmentPortfolio } from '../../../../../../lib/api';
import { requireAuthSession } from '../../../../../../lib/auth';
import { t } from '../../../../../../lib/phase3-translations';
import { ErrorState } from '../../../../../../components/molecules/ErrorState';
import { PageHeader } from '../../../../../../components/molecules/PageHeader';
import { InvestmentPositionForm } from '../../../../../../components/organisms/InvestmentPositionForm';

export default async function EditHouseholdInvestmentPage({ params }: { params: Promise<{ positionId: string }> }) {
  const { positionId } = await params;
  const session = await requireAuthSession(`/household/investing/${positionId}/edit`);
  const householdId = session.activeHouseholdId as string;
  const portfolio = await getHouseholdInvestmentPortfolio(householdId).catch(() => null);
  const position = portfolio?.positions.find((item) => item.position.id === positionId)?.position;

  if (!position) {
    return <div className="space-y-6"><PageHeader eyebrow={t.household.investing.pageTitle} title={t.household.investing.editPageTitle} /><ErrorState message="Nie znaleziono pozycji inwestycyjnej lub nie masz do niej dostępu." /></div>;
  }
  if (position.ownerUserId !== session.user?.id) {
    return <div className="space-y-6"><PageHeader eyebrow={position.instrument} eyebrowHref={`/household/investing/${position.id}`} title={t.household.investing.editPageTitle} /><ErrorState message="Tylko właściciel pozycji może ją zmieniać. To ograniczenie jest egzekwowane przez backend." /></div>;
  }
  if (position.archivedAt) {
    return <div className="space-y-6"><PageHeader eyebrow={position.instrument} eyebrowHref={`/household/investing/${position.id}`} title={t.household.investing.editPageTitle} /><ErrorState message={t.household.investing.archived} /></div>;
  }

  return <div className="space-y-6"><PageHeader eyebrow={position.instrument} eyebrowHref={`/household/investing/${position.id}`} title={t.household.investing.editPageTitle} description={t.household.investing.formDescription} /><InvestmentPositionForm householdId={householdId} position={position} /></div>;
}

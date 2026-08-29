import { getHouseholdEnvelopes } from '../../../../lib/api';
import { requireAuthSession } from '../../../../lib/auth';
import { t } from '../../../../lib/translations';
import { EmptyState } from '../../../../components/molecules/EmptyState';
import { EnvelopeProgressCard } from '../../../../components/molecules/EnvelopeProgressCard';
import { PageHeader } from '../../../../components/molecules/PageHeader';

export default async function HouseholdEnvelopesPage() {
  const session = await requireAuthSession('/household/envelopes');
  const householdId = session.activeHouseholdId as string;

  const envelopes = await getHouseholdEnvelopes(householdId);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.household.dashboard.pageEyebrow} title={t.household.dashboard.envelopesTitle} />
      {envelopes.length === 0 ? (
        <EmptyState title={t.household.dashboard.envelopesEmptyTitle} description={t.household.dashboard.envelopesEmptyDescription} />
      ) : (
        <EnvelopeProgressCard envelopes={envelopes} />
      )}
    </div>
  );
}

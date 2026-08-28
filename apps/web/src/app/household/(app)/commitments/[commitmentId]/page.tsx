import { getHouseholdAccounts, getHouseholdCommitment, getHouseholdCommitmentAmortizationSchedule } from '../../../../../lib/api';
import { requireAuthSession } from '../../../../../lib/auth';
import { t } from '../../../../../lib/translations';
import { PageHeader } from '../../../../../components/molecules/PageHeader';
import { CommitmentDetailView } from '../../../../../components/organisms/CommitmentDetailView';

export default async function CommitmentDetailPage({
  params,
}: {
  params: Promise<{ commitmentId: string }>;
}) {
  const { commitmentId } = await params;
  const session = await requireAuthSession(`/household/commitments/${commitmentId}`);
  const householdId = session.activeHouseholdId as string;

  const [commitment, accounts] = await Promise.all([
    getHouseholdCommitment(householdId, commitmentId),
    getHouseholdAccounts(householdId).catch(() => []),
  ]);
  const account = accounts.find((item) => item.id === commitment.accountId) ?? null;

  const canComputeAmortization = commitment.type === 'LOAN' && commitment.principal && commitment.interestRate && commitment.termMonths;
  const amortizationSchedule = canComputeAmortization
    ? await getHouseholdCommitmentAmortizationSchedule(householdId, commitmentId).catch(() => null)
    : null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.household.commitments.types[commitment.type]} title={commitment.name} />
      <CommitmentDetailView
        householdId={householdId}
        commitment={commitment}
        account={account}
        amortizationSchedule={amortizationSchedule}
      />
    </div>
  );
}

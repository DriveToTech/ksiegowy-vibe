import Link from 'next/link';
import { getHouseholdCommitments } from '../../../../lib/api';
import { requireAuthSession } from '../../../../lib/auth';
import { formatMoney } from '../../../../lib/format';
import { t } from '../../../../lib/translations';
import { Button } from '../../../../components/atoms/Button';
import { EmptyState } from '../../../../components/molecules/EmptyState';
import { PageHeader } from '../../../../components/molecules/PageHeader';
import { CommitmentsList } from '../../../../components/organisms/CommitmentsList';

export default async function HouseholdCommitmentsPage() {
  const session = await requireAuthSession('/household/commitments');
  const householdId = session.activeHouseholdId as string;

  const commitments = await getHouseholdCommitments(householdId);
  const fixedMonthlyTotal = commitments
    .filter((commitment) => commitment.status === 'ACTIVE' && commitment.billingFrequency === 'MONTHLY')
    .reduce((sum, commitment) => sum + (parseFloat(commitment.amount) || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.household.commitments.pageEyebrow}
        title={t.household.commitments.pageTitle}
        actions={
          <Link href="/household/commitments/new">
            <Button>{t.household.commitments.addCommitment}</Button>
          </Link>
        }
      />

      {commitments.length > 0 ? (
        <div className="max-w-xs rounded-card border border-outline bg-surface-panel p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.household.commitments.fixedMonthlyLabel}</p>
          <p className="mt-1 text-[22px] font-semibold tracking-[-0.02em] tabular-nums text-foreground">{formatMoney(fixedMonthlyTotal)}</p>
        </div>
      ) : null}

      {commitments.length === 0 ? (
        <EmptyState
          title={t.household.commitments.emptyTitle}
          description={t.household.commitments.emptyDescription}
          action={
            <Link href="/household/commitments/new">
              <Button>{t.household.commitments.addCommitment}</Button>
            </Link>
          }
        />
      ) : (
        <CommitmentsList commitments={commitments} />
      )}
    </div>
  );
}

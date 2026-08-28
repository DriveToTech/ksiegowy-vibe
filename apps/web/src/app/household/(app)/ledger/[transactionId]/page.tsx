import { getHouseholdAccounts, getHouseholdCategories, getHouseholdEnvelopes, getHouseholdMembers, getHouseholdTransaction } from '../../../../../lib/api';
import { requireAuthSession } from '../../../../../lib/auth';
import { t } from '../../../../../lib/translations';
import { PageHeader } from '../../../../../components/molecules/PageHeader';
import { TransactionDetailView } from '../../../../../components/organisms/TransactionDetailView';

export default async function HouseholdTransactionDetailPage({
  params,
}: {
  params: Promise<{ transactionId: string }>;
}) {
  const { transactionId } = await params;
  const session = await requireAuthSession(`/household/ledger/${transactionId}`);
  const householdId = session.activeHouseholdId as string;

  const [transaction, accounts, categories, members, envelopes] = await Promise.all([
    getHouseholdTransaction(householdId, transactionId),
    getHouseholdAccounts(householdId).catch(() => []),
    getHouseholdCategories(householdId).catch(() => []),
    getHouseholdMembers(householdId).catch(() => []),
    getHouseholdEnvelopes(householdId).catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.household.ledger.pageEyebrow} title={transaction.payee} />
      <TransactionDetailView
        householdId={householdId}
        transaction={transaction}
        accounts={accounts}
        categories={categories}
        members={members}
        envelopes={envelopes}
      />
    </div>
  );
}

import { requireAuthSession } from '../../../../../lib/auth';
import { t } from '../../../../../lib/translations';
import { PageHeader } from '../../../../../components/molecules/PageHeader';
import { ImportStatementForm } from './ImportStatementForm';

export default async function ImportStatementPage() {
  const session = await requireAuthSession('/household/ledger/import');
  const householdId = session.activeHouseholdId as string;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.household.ledger.pageEyebrow} title={t.household.ledger.importStatement} />
      <ImportStatementForm householdId={householdId} />
    </div>
  );
}

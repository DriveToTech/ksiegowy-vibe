import Link from 'next/link';
import { getContractors } from '../../../lib/api';
import { Button } from '../../../components/atoms/Button';
import { EmptyState } from '../../../components/molecules/EmptyState';
import { PageHeader } from '../../../components/molecules/PageHeader';
import { getActiveCompanyRole, requireAuthSession } from '../../../lib/auth';
import { t } from '../../../lib/translations';
import { ContractorList } from './ContractorList';

export default async function DashboardContractorsPage() {
  const session = await requireAuthSession('/dashboard/contractors');
  const companyId = session.activeCompanyId;

  if (!companyId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.contractors.pageEyebrow}
          title={t.contractors.pageTitle}
          description={t.contractors.pageDescription}
        />
        <EmptyState
          title={t.contractors.noCompany}
          description=""
          action={
            <Link href="/dashboard/settings">
              <Button>{t.settings.goToSettings}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const role = getActiveCompanyRole(session);
  const canEdit = role === 'ADMIN' || role === 'ACCOUNTANT';

  const contractors = await getContractors(companyId, { status: 'all' }).catch((error: unknown) => {
    throw error instanceof Error ? error : new Error(t.contractors.errors.loadFailed);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.contractors.pageEyebrow}
        title={t.contractors.pageTitle}
        description={t.contractors.pageDescription}
        actions={canEdit ? (
          <Link href="/dashboard/contractors/new">
            <Button>{t.contractors.addButton}</Button>
          </Link>
        ) : null}
      />

      <ContractorList contractors={contractors} canEdit={canEdit} companyId={companyId} />
    </div>
  );
}

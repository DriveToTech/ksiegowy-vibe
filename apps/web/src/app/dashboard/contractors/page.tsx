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
          action={<Button href="/dashboard/settings">{t.settings.goToSettings}</Button>}
        />
      </div>
    );
  }

  const activeEnvironment = session.activeKsefEnvironment;
  if (!activeEnvironment) {
    return <EmptyState title={t.contractors.noCompany} description="" />;
  }

  const role = getActiveCompanyRole(session);
  const canEdit = role === 'ADMIN' || role === 'ACCOUNTANT';

  const contractors = await getContractors(companyId, activeEnvironment, { status: 'all' }).catch((error: unknown) => {
    throw error instanceof Error ? error : new Error(t.contractors.errors.loadFailed);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.contractors.pageEyebrow}
        title={t.contractors.pageTitle}
        description={t.contractors.pageDescription}
        actions={canEdit ? <Button href="/dashboard/contractors/new">{t.contractors.addButton}</Button> : null}
      />

      <ContractorList contractors={contractors} canEdit={canEdit} companyId={companyId} activeEnvironment={activeEnvironment} />
    </div>
  );
}

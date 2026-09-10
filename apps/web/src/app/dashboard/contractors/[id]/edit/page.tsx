import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContractor, getServiceTemplates, getContractorServiceRates } from '../../../../../lib/api';
import { PageHeader } from '../../../../../components/molecules/PageHeader';
import { getActiveCompanyRole, requireAuthSession } from '../../../../../lib/auth';
import { t } from '../../../../../lib/translations';
import { EditContractorForm } from './EditContractorForm';
import { ContractorServiceRates } from '../../ContractorServiceRates';

export default async function EditContractorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAuthSession(`/dashboard/contractors/${id}/edit`);
  const companyId = session.activeCompanyId;

  if (!companyId) notFound();

  const role = getActiveCompanyRole(session);
  const canEdit = role === 'ADMIN' || role === 'ACCOUNTANT';

  const [contractor, templates, rates] = await Promise.all([
    getContractor(companyId, id).catch(() => null),
    getServiceTemplates(companyId).catch(() => []),
    getContractorServiceRates(companyId, id).catch(() => []),
  ]);

  if (!contractor) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Link href="/dashboard/contractors" className="inline-flex min-h-11 items-center transition hover:text-foreground">
          ← {t.contractors.breadcrumb}
        </Link>
        <span>/</span>
        <span className="text-foreground">{contractor.name}</span>
      </div>

      <PageHeader
        eyebrow={t.contractors.pageEyebrow}
        title={t.contractors.editPageTitle(contractor.name)}
        description={t.contractors.editPageDescription}
      />

      {canEdit ? (
        <EditContractorForm companyId={companyId} contractor={contractor} />
      ) : (
        <p className="text-sm text-muted">{t.contractors.readonlyWarning}</p>
      )}

      {canEdit ? (
        <div className="xl:max-w-2xl">
          <ContractorServiceRates
            companyId={companyId}
            contractorId={id}
            initialRates={rates}
            templates={templates}
          />
        </div>
      ) : null}
    </div>
  );
}

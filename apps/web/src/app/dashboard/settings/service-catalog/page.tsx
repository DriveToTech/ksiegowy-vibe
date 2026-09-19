import { getServiceTemplates } from '../../../../lib/api';
import { Button } from '../../../../components/atoms/Button';
import { EmptyState } from '../../../../components/molecules/EmptyState';
import { PageHeader } from '../../../../components/molecules/PageHeader';
import { requireAuthSession } from '../../../../lib/auth';
import { t } from '../../../../lib/translations';
import { ServiceCatalogManager } from './ServiceCatalogManager';

export default async function ServiceCatalogPage() {
  const session = await requireAuthSession('/dashboard/settings/service-catalog');
  const companyId = session.activeCompanyId;

  if (!companyId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.serviceCatalog.pageEyebrow}
          title={t.serviceCatalog.pageTitle}
          description={t.serviceCatalog.pageDescription}
        />
        <EmptyState
          title={t.settings.noCompany}
          description={t.serviceCatalog.noCompanyDescription}
          action={<Button href="/dashboard/settings">{t.settings.goToSettings}</Button>}
        />
      </div>
    );
  }

  const templates = await getServiceTemplates(companyId, true);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.serviceCatalog.pageEyebrow}
        title={t.serviceCatalog.pageTitle}
        description={t.serviceCatalog.pageDescription}
      />
      <ServiceCatalogManager companyId={companyId} initialTemplates={templates} />
    </div>
  );
}

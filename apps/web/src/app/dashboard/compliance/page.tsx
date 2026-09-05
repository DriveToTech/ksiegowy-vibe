import Link from 'next/link';
import { Button } from '../../../components/atoms/Button';
import { EmptyState } from '../../../components/molecules/EmptyState';
import { ErrorState } from '../../../components/molecules/ErrorState';
import { PageHeader } from '../../../components/molecules/PageHeader';
import { getActiveCompany } from '../../../lib/api';
import { t } from '../../../lib/translations';

export default async function CompliancePage() {
  const activeCompany = await getActiveCompany().catch(() => null);

  if (activeCompany === null) {
    return <ErrorState message={t.invoiceDetail.errors.companyLoadFailed} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.compliance.pageEyebrow}
        title={t.compliance.pageTitle}
        description={t.compliance.pageDescription}
      />
      {activeCompany.activeCompanyId ? (
        <EmptyState
          title={t.compliance.notAvailableTitle}
          description={t.compliance.notAvailableDescription}
        />
      ) : (
        <EmptyState
          title={t.compliance.noCompanyTitle}
          description={t.compliance.noCompanyDescription}
          action={
            <Link href="/dashboard/settings">
              <Button>{t.settings.goToSettings}</Button>
            </Link>
          }
        />
      )}
    </div>
  );
}

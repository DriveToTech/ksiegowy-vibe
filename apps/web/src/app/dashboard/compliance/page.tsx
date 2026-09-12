import { Button } from '../../../components/atoms/Button';
import { EmptyState } from '../../../components/molecules/EmptyState';
import { PageHeader } from '../../../components/molecules/PageHeader';
import { requireAuthSession } from '../../../lib/auth';
import { t } from '../../../lib/translations';

export default async function CompliancePage() {
  const session = await requireAuthSession('/dashboard/compliance');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.compliance.pageEyebrow}
        title={t.compliance.pageTitle}
        description={t.compliance.pageDescription}
      />
      {session.activeCompanyId ? (
        <EmptyState
          title={t.compliance.notAvailableTitle}
          description={t.compliance.notAvailableDescription}
        />
      ) : (
        <EmptyState
          title={t.compliance.noCompanyTitle}
          description={t.compliance.noCompanyDescription}
          action={<Button href="/dashboard/settings">{t.settings.goToSettings}</Button>}
        />
      )}
    </div>
  );
}

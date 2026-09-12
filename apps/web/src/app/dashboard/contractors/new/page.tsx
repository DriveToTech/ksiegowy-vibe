import Link from 'next/link';
import { Button } from '../../../../components/atoms/Button';
import { EmptyState } from '../../../../components/molecules/EmptyState';
import { PageHeader } from '../../../../components/molecules/PageHeader';
import { requireAuthSession } from '../../../../lib/auth';
import { t } from '../../../../lib/translations';
import { NewContractorForm } from './NewContractorForm';

export default async function NewContractorPage() {
  const session = await requireAuthSession('/dashboard/contractors/new');
  const companyId = session.activeCompanyId;

  if (!companyId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.contractors.pageEyebrow}
          title={t.contractors.newPageTitle}
          description={t.contractors.newPageDescription}
        />
        <EmptyState
          title={t.contractors.noCompany}
          description=""
          action={<Button href="/dashboard/settings">{t.settings.goToSettings}</Button>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Link href="/dashboard/contractors" className="inline-flex min-h-11 items-center transition hover:text-foreground">
          ← {t.contractors.breadcrumb}
        </Link>
        <span>/</span>
        <span className="text-foreground">{t.contractors.newPageTitle}</span>
      </div>
      <PageHeader
        eyebrow={t.contractors.pageEyebrow}
        title={t.contractors.newPageTitle}
        description={t.contractors.newPageDescription}
      />
      <NewContractorForm companyId={companyId} />
    </div>
  );
}

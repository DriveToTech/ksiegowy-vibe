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

  const contractors = await getContractors(companyId).catch((error: unknown) => {
    throw error instanceof Error ? error : new Error(t.contractors.errors.loadFailed);
  });

  const activeCount = contractors.filter((c) => c.isActive).length;

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

      {contractors.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-3 xl:max-w-2xl">
          <SummaryCard label={t.contractors.summary.total} value={String(contractors.length)} />
          <SummaryCard label={t.contractors.summary.active} value={String(activeCount)} strong />
          <SummaryCard label={t.contractors.summary.inactive} value={String(contractors.length - activeCount)} />
        </div>
      ) : null}

      <ContractorList contractors={contractors} canEdit={canEdit} />
    </div>
  );
}

function SummaryCard({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-card border border-outline bg-surface-panel p-4">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className={strong ? 'mt-2 text-lg font-semibold text-primary' : 'mt-2 text-lg font-semibold text-foreground'}>{value}</p>
    </div>
  );
}

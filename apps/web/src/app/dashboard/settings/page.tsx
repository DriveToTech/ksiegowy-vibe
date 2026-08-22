import Link from 'next/link';
import { getCompany, getCompanyBackupPolicy, getCompanyBackupStatus, getCompanyKsefSettings, getInvites, getMembers } from '../../../lib/api';
import { Banner } from '../../../components/molecules/Banner';
import { EmptyState } from '../../../components/molecules/EmptyState';
import { PageHeader } from '../../../components/molecules/PageHeader';
import { getActiveCompanyRole, requireAuthSession } from '../../../lib/auth';
import { CompanyDetailsForm } from './CompanyDetailsForm';
import { CompanyBackupPolicyForm } from './CompanyBackupPolicyForm';
import { InvoiceNumberPatternForm } from './InvoiceNumberPatternForm';
import { KsefSettingsForm } from './KsefSettingsForm';
import { MembersTab } from './MembersTab';
import { t } from '../../../lib/translations';

export default async function DashboardSettingsPage() {
  const session = await requireAuthSession('/dashboard/settings');
  const activeCompanyId = session.activeCompanyId;

  if (!activeCompanyId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Administracja"
          title={t.settings.title}
          description="Zarządzaj dostępami do firmy, rolami użytkowników i oczekującymi zaproszeniami."
        />
        <EmptyState
          title="Brak aktywnej firmy"
          description="Nie masz jeszcze skonfigurowanej firmy. Dodaj ją poniżej, aby odblokować dashboard, kontrahentów i faktury."
        />
        <CompanyDetailsForm company={null} canEdit />
      </div>
    );
  }

  const role = getActiveCompanyRole(session);
  const isAdmin = role === 'ADMIN';
  const canEditCompany = role === 'ADMIN' || role === 'ACCOUNTANT';

  const [company, members, invites, ksefSettingsResult, backupSettingsResult, backupStatusResult] = await Promise.all([
    getCompany(activeCompanyId),
    getMembers(activeCompanyId).catch(() => []),
    isAdmin ? getInvites(activeCompanyId).catch(() => []) : Promise.resolve([]),
    isAdmin
      ? getCompanyKsefSettings(activeCompanyId)
          .then((ksefSettings) => ({ ksefSettings, hasError: false }))
          .catch(() => ({ ksefSettings: null, hasError: true }))
      : Promise.resolve({ ksefSettings: null, hasError: false }),
    isAdmin
      ? getCompanyBackupPolicy(activeCompanyId)
          .then((backupSettings) => ({ backupSettings, hasError: false }))
          .catch(() => ({ backupSettings: null, hasError: true }))
      : Promise.resolve({ backupSettings: null, hasError: false }),
    isAdmin
      ? getCompanyBackupStatus(activeCompanyId)
          .then((backupStatus) => ({ backupStatus, hasError: false }))
          .catch(() => ({ backupStatus: null, hasError: true }))
      : Promise.resolve({ backupStatus: null, hasError: false }),
  ]);

  const backupSettings = backupSettingsResult.backupSettings;
  const backupStatus = backupStatusResult.backupStatus;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administracja"
        title={t.settings.title}
        description="Zarządzaj dostępami do firmy, rolami użytkowników i oczekującymi zaproszeniami."
      />
      <div className="grid gap-4 md:grid-cols-3 xl:max-w-4xl">
        <SummaryCard label="Członkowie" value={String(members.length)} />
        <SummaryCard label="Zaproszenia" value={String(invites.length)} />
        <SummaryCard label="Twoja rola" value={role === 'ADMIN' ? 'Administrator' : role === 'ACCOUNTANT' ? 'Księgowy' : 'Podgląd'} strong />
      </div>
      <CompanyDetailsForm company={company} canEdit={canEditCompany} />
      {isAdmin && ksefSettingsResult.ksefSettings ? (
        <KsefSettingsForm companyId={activeCompanyId} settings={ksefSettingsResult.ksefSettings} />
      ) : null}
      {isAdmin && !ksefSettingsResult.ksefSettings ? (
        <Banner tone="error" className="xl:max-w-4xl">
          Nie udało się pobrać ustawień KSeF. Odśwież stronę i spróbuj ponownie.
        </Banner>
      ) : null}
      {isAdmin ? (
        <InvoiceNumberPatternForm companyId={activeCompanyId} currentPattern={company?.invoiceNumberPattern ?? null} />
      ) : null}
      {isAdmin && backupSettings ? (
        <CompanyBackupPolicyForm
          companyId={activeCompanyId}
          initialBackupSettings={backupSettings}
          initialBackupStatus={backupStatus}
          hasBackupStatusError={backupStatusResult.hasError}
        />
      ) : null}
      {isAdmin && !backupSettings ? (
        <Banner tone="error" className="xl:max-w-4xl">
          Nie udało się pobrać ustawień backupu firmy. Odśwież stronę i spróbuj ponownie.
        </Banner>
      ) : null}
      <div className="rounded-[2rem_1.25rem_2.25rem_1.5rem] border border-outline bg-surface-panel/55 p-5 backdrop-blur-xl xl:max-w-4xl">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{t.settings.serviceCatalogLink}</p>
        <p className="mt-1 text-sm text-muted">
          {t.serviceCatalog.pageDescription}
        </p>
        <Link
          href="/dashboard/settings/service-catalog"
          className="mt-3 inline-block text-sm font-semibold text-primary transition hover:text-primary/80"
        >
          {t.settings.serviceCatalogLink} →
        </Link>
      </div>
      <MembersTab
        companyId={activeCompanyId}
        currentUserId={session.user?.id ?? ''}
        isAdmin={isAdmin}
        initialMembers={members}
        initialInvites={invites}
      />
    </div>
  );
}

function SummaryCard({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-[2rem_1.25rem_2.25rem_1.5rem] border border-outline bg-surface-panel/55 p-4 backdrop-blur-xl">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className={strong ? 'mt-2 text-lg font-semibold text-primary' : 'mt-2 text-lg font-semibold text-foreground'}>{value}</p>
    </div>
  );
}

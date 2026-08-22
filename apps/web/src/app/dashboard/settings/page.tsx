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
import { SettingsWorkspace } from './SettingsWorkspace';
import { Surface } from '../../../components/atoms/Surface';
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

      <SettingsWorkspace
        sections={{
          company: <CompanyDetailsForm company={company} canEdit={canEditCompany} />,
          ksef: isAdmin ? (
            ksefSettingsResult.ksefSettings ? (
              <KsefSettingsForm companyId={activeCompanyId} settings={ksefSettingsResult.ksefSettings} />
            ) : (
              <Banner tone="error">Nie udało się pobrać ustawień KSeF. Odśwież stronę i spróbuj ponownie.</Banner>
            )
          ) : undefined,
          numbering: isAdmin ? (
            <InvoiceNumberPatternForm companyId={activeCompanyId} currentPattern={company?.invoiceNumberPattern ?? null} />
          ) : undefined,
          products: (
            <Surface tone="panel" className="space-y-3 p-6">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">{t.settings.serviceCatalogLink}</h2>
                <p className="mt-1 text-sm text-muted">{t.serviceCatalog.pageDescription}</p>
              </div>
              <Link
                href="/dashboard/settings/service-catalog"
                className="inline-block text-sm font-semibold text-primary transition hover:text-primary/80"
              >
                {t.settings.serviceCatalogLink} →
              </Link>
            </Surface>
          ),
          team: (
            <MembersTab
              companyId={activeCompanyId}
              currentUserId={session.user?.id ?? ''}
              isAdmin={isAdmin}
              initialMembers={members}
              initialInvites={invites}
            />
          ),
          backup: isAdmin ? (
            backupSettings ? (
              <CompanyBackupPolicyForm
                companyId={activeCompanyId}
                initialBackupSettings={backupSettings}
                initialBackupStatus={backupStatus}
                hasBackupStatusError={backupStatusResult.hasError}
              />
            ) : (
              <Banner tone="error">Nie udało się pobrać ustawień backupu firmy. Odśwież stronę i spróbuj ponownie.</Banner>
            )
          ) : undefined,
        }}
      />
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

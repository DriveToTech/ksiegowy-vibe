'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { API_BASE } from '../../../lib/api-base';
import type {
  BackupErrorCode,
  CompanyBackupStatusReadModel,
  CompanyBackupRunResult,
  CompanyBackupScheduleMode,
  CompanyBackupSettings,
  CompanyBackupOverallStatus,
  GoogleDriveConnectionStatus,
  PlatformPostgresqlBackupReasonCode,
  PlatformPostgresqlBackupStatus,
} from '../../../lib/api-types';
import { ApiClientError, runCompanyBackupPolicy, updateCompanyBackupPolicy } from '../../../lib/api-client';
import { Badge } from '../../../components/atoms/Badge';
import { Button } from '../../../components/atoms/Button';
import { Input } from '../../../components/atoms/Input';
import { Select } from '../../../components/atoms/Select';
import { Surface } from '../../../components/atoms/Surface';
import { Banner } from '../../../components/molecules/Banner';
import { FormField } from '../../../components/molecules/FormField';

interface CompanyBackupPolicyFormProps {
  companyId: string;
  initialBackupSettings: CompanyBackupSettings;
  initialBackupStatus: CompanyBackupStatusReadModel | null;
  hasBackupStatusError: boolean;
}

export function CompanyBackupPolicyForm({
  companyId,
  initialBackupSettings,
  initialBackupStatus,
  hasBackupStatusError,
}: CompanyBackupPolicyFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [backupSettings, setBackupSettings] = useState(initialBackupSettings);
  const [backupStatus, setBackupStatus] = useState(initialBackupStatus);
  const [automaticOnInvoiceIssued, setAutomaticOnInvoiceIssued] = useState(
    initialBackupSettings.policy.automaticOnInvoiceIssued,
  );
  const [scheduleMode, setScheduleMode] = useState<CompanyBackupScheduleMode>(
    initialBackupSettings.policy.scheduleMode,
  );
  const [scheduleHour, setScheduleHour] = useState(
    initialBackupSettings.policy.scheduleHour === null ? '' : String(initialBackupSettings.policy.scheduleHour),
  );
  const [scheduleMinute, setScheduleMinute] = useState(
    initialBackupSettings.policy.scheduleMinute === null ? '' : String(initialBackupSettings.policy.scheduleMinute),
  );
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState(
    initialBackupSettings.policy.scheduleDayOfWeek === null ? '' : String(initialBackupSettings.policy.scheduleDayOfWeek),
  );
  const [saveBusy, setSaveBusy] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [error, setError] = useState<{ message: string; code: BackupErrorCode | null } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastRunResult, setLastRunResult] = useState<CompanyBackupRunResult | null>(null);

  useEffect(() => {
    setBackupSettings(initialBackupSettings);
    setAutomaticOnInvoiceIssued(initialBackupSettings.policy.automaticOnInvoiceIssued);
    setScheduleMode(initialBackupSettings.policy.scheduleMode);
    setScheduleHour(initialBackupSettings.policy.scheduleHour === null ? '' : String(initialBackupSettings.policy.scheduleHour));
    setScheduleMinute(initialBackupSettings.policy.scheduleMinute === null ? '' : String(initialBackupSettings.policy.scheduleMinute));
    setScheduleDayOfWeek(
      initialBackupSettings.policy.scheduleDayOfWeek === null ? '' : String(initialBackupSettings.policy.scheduleDayOfWeek),
    );
  }, [initialBackupSettings]);

  useEffect(() => {
    setBackupStatus(initialBackupStatus);
  }, [initialBackupStatus]);

  const googleDriveConnectUrl = useMemo(() => {
    const queryParameters = new URLSearchParams({ companyId });
    return `${API_BASE}/backup/gdrive/connect?${queryParameters.toString()}`;
  }, [companyId]);

  const postgresqlStatus = backupStatus?.platformPostgresql;
  const googleDriveStatus = backupStatus?.companyGoogleDrive;
  const googleDriveConnectionStatus = getGoogleDriveConnectionStatus(backupSettings, googleDriveStatus?.connectionStatus);
  const isGoogleDriveConnected = googleDriveConnectionStatus === 'CONNECTED';
  const requiresGoogleDriveReauthorization = googleDriveConnectionStatus === 'REAUTHORIZATION_REQUIRED';

  useEffect(() => {
    if (searchParams.get('gdrive') !== 'connected') {
      return;
    }

    setSuccess('Połączenie Google Drive jest gotowe do użycia.');

    const nextSearchParameters = new URLSearchParams(searchParams.toString());
    nextSearchParameters.delete('gdrive');
    const nextUrl = nextSearchParameters.toString().length > 0
      ? `${pathname}?${nextSearchParameters.toString()}`
      : pathname;

    router.replace(nextUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (scheduleMode !== 'MANUAL') {
      const parsedHour = Number(scheduleHour);
      const parsedMinute = Number(scheduleMinute);
      if (!Number.isInteger(parsedHour) || parsedHour < 0 || parsedHour > 23) {
        setError({ message: 'Godzina harmonogramu musi być liczbą od 0 do 23.', code: null });
        return;
      }
      if (!Number.isInteger(parsedMinute) || parsedMinute < 0 || parsedMinute > 59) {
        setError({ message: 'Minuta harmonogramu musi być liczbą od 0 do 59.', code: null });
        return;
      }
      if (scheduleMode === 'WEEKLY') {
        const parsedDayOfWeek = Number(scheduleDayOfWeek);
        if (!Number.isInteger(parsedDayOfWeek) || parsedDayOfWeek < 1 || parsedDayOfWeek > 7) {
          setError({ message: 'Dzień tygodnia musi być liczbą od 1 (poniedziałek) do 7 (niedziela).', code: null });
          return;
        }
      }
    }

    setSaveBusy(true);

    const scheduleHourValue = scheduleMode === 'MANUAL' ? null : Number(scheduleHour);
    const scheduleMinuteValue = scheduleMode === 'MANUAL' ? null : Number(scheduleMinute);
    const scheduleDayOfWeekValue = scheduleMode === 'WEEKLY' ? Number(scheduleDayOfWeek) : null;

    updateCompanyBackupPolicy(companyId, {
      automaticOnInvoiceIssued,
      scheduleMode,
      scheduleHour: scheduleHourValue,
      scheduleMinute: scheduleMinuteValue,
      scheduleDayOfWeek: scheduleDayOfWeekValue,
      scheduleTimezone: backupSettings.policy.scheduleTimezone,
    })
      .then((updatedSettings) => {
        setBackupSettings(updatedSettings);
        setAutomaticOnInvoiceIssued(updatedSettings.policy.automaticOnInvoiceIssued);
        setScheduleMode(updatedSettings.policy.scheduleMode);
        setScheduleHour(updatedSettings.policy.scheduleHour === null ? '' : String(updatedSettings.policy.scheduleHour));
        setScheduleMinute(updatedSettings.policy.scheduleMinute === null ? '' : String(updatedSettings.policy.scheduleMinute));
        setScheduleDayOfWeek(
          updatedSettings.policy.scheduleDayOfWeek === null ? '' : String(updatedSettings.policy.scheduleDayOfWeek),
        );
        setSuccess('Polityka kopii zapasowych została zapisana.');
        router.refresh();
      })
      .catch((requestError: unknown) => {
        setError({
          message: requestError instanceof Error ? requestError.message : 'Nie udało się zapisać polityki kopii zapasowych.',
          code: requestError instanceof ApiClientError && requestError.code === 'REAUTHORIZATION_REQUIRED'
            ? requestError.code
            : null,
        });
      })
      .finally(() => setSaveBusy(false));
  };

  const handleRunNow = () => {
    setError(null);
    setSuccess(null);
    setRunBusy(true);

    runCompanyBackupPolicy(companyId)
      .then((runResult) => {
        setLastRunResult(runResult);
        setSuccess('Uruchomiono ręczny backup Google Drive.');
        setBackupSettings((currentSettings) => ({
          ...currentSettings,
          googleDrive: {
            ...currentSettings.googleDrive,
            lastBackupAt: runResult.finishedAt,
          },
        }));
        router.refresh();
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof ApiClientError && requestError.code === 'REAUTHORIZATION_REQUIRED') {
          setBackupSettings((currentSettings) => ({
            ...currentSettings,
            googleDrive: {
              ...currentSettings.googleDrive,
              isConnected: false,
              requiresReauthorization: true,
            },
          }));
          setBackupStatus((currentStatus) => {
            if (currentStatus === null) {
              return currentStatus;
            }

            return {
              ...currentStatus,
              companyGoogleDrive: {
                ...currentStatus.companyGoogleDrive,
                connectionStatus: 'REAUTHORIZATION_REQUIRED',
                summary:
                  'Google Drive wymaga ponownego połączenia przed uruchomieniem backupu ręcznego i automatycznego.',
              },
            };
          });
          setError({
            message: 'Google Drive wymaga ponownego połączenia przed uruchomieniem backupu. Odśwież autoryzację i spróbuj ponownie.',
            code: requestError.code,
          });
          return;
        }

        setError({
          message: requestError instanceof Error ? requestError.message : 'Nie udało się uruchomić backupu.',
          code: null,
        });
      })
      .finally(() => setRunBusy(false));
  };

  return (
    <Surface tone="panel" className="space-y-5 p-6 xl:max-w-4xl">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Kopie zapasowe</h2>
        <p className="mt-1 text-sm text-muted">
          Platformowy backup PostgreSQL jest zarządzany operacyjnie (tylko podgląd). Backup plików firmowych do Google Drive konfigurujesz na poziomie firmy.
        </p>
      </div>

      {error ? (
        <Banner tone="error">
          <p>{error.message}</p>
          {error.code === 'REAUTHORIZATION_REQUIRED' ? (
            <div className="mt-3">
              <a
                href={googleDriveConnectUrl}
                className="inline-flex h-10 items-center justify-center rounded-control bg-surface-panel px-4 text-sm font-semibold text-secondary-ink transition hover:bg-surface-raised"
              >
                Połącz ponownie Google Drive
              </a>
            </div>
          ) : null}
        </Banner>
      ) : null}
      {success ? <Banner tone="success">{success}</Banner> : null}

      {hasBackupStatusError ? (
        <Banner tone="info">
          Nie udało się pobrać wskaźników statusu backupu. Ustawienia polityki Google Drive nadal możesz edytować.
        </Banner>
      ) : null}

      <div className="rounded-[1.4rem] border border-outline bg-surface-raised/45 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Platform PostgreSQL backup</p>
            <p className="mt-1 text-sm text-muted">
              {postgresqlStatus?.summary ?? 'Status platformowego backupu PostgreSQL jest chwilowo niedostępny.'}
            </p>
          </div>
          <Badge tone={postgresqlStatus ? backupStatusBadgeTone[postgresqlStatus.status] : 'neutral'}>
            {postgresqlStatus ? backupStatusLabel[postgresqlStatus.status] : 'Niedostępny'}
          </Badge>
        </div>
        <p className="mt-3 text-sm text-muted">
          Ostatnie sprawdzenie:{' '}
          <span className="font-medium text-foreground">
            {postgresqlStatus ? formatDateTime(postgresqlStatus.checkedAt) : 'Brak danych'}
          </span>
        </p>
      </div>

      <div className="rounded-[1.4rem] border border-outline bg-surface-raised/45 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Google Drive backup firmy</p>
            <p className="mt-1 text-sm text-muted">
              {googleDriveStatus?.summary
                ?? (requiresGoogleDriveReauthorization
                  ? 'Google Drive wymaga ponownego połączenia, aby backup ręczny i automatyczny mogły wrócić do działania.'
                  : 'Połącz konto Google Drive i ustaw automatyzację backupu dla dokumentów firmy.')}
            </p>
          </div>
          <Badge
            tone={googleDriveConnectionStatus === 'CONNECTED' ? 'success' : 'warning'}
          >
            {googleDriveConnectionStatus === 'CONNECTED'
              ? 'Połączony'
              : googleDriveConnectionStatus === 'REAUTHORIZATION_REQUIRED'
                ? 'Wymaga ponownego połączenia'
                : 'Niepołączony'}
          </Badge>
        </div>

        {requiresGoogleDriveReauthorization ? (
          <div className="mt-3">
            <a
              href={googleDriveConnectUrl}
              className="inline-flex h-10 items-center justify-center rounded-full bg-surface-panel/70 px-4 text-sm font-semibold text-secondary-ink transition hover:bg-surface-raised/80"
            >
              Połącz ponownie Google Drive
            </a>
          </div>
        ) : null}

        <p className="mt-3 text-sm text-muted">
          Ostatni backup:{' '}
          <span className="font-medium text-foreground">
            {googleDriveStatus?.lastBackupAt
              ? formatDateTime(googleDriveStatus.lastBackupAt)
              : backupSettings.googleDrive.lastBackupAt
                ? formatDateTime(backupSettings.googleDrive.lastBackupAt)
                : 'Jeszcze nie wykonano'}
          </span>
        </p>
      </div>

      <div className="rounded-[1.4rem] border border-outline bg-surface-raised/45 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Polityka backupu Google Drive</p>
            <p className="mt-1 text-sm text-muted">
              {requiresGoogleDriveReauthorization
                ? 'Autoryzacja Google Drive wygasła lub została cofnięta. Odnów połączenie, aby przywrócić backup ręczny i harmonogram.'
                : 'Połącz konto Google Drive i ustaw automatyzację backupu dla dokumentów firmy.'}
            </p>
          </div>
          <Badge tone={isGoogleDriveConnected ? 'success' : 'warning'}>
            {isGoogleDriveConnected
              ? 'Konto podłączone'
              : requiresGoogleDriveReauthorization
                ? 'Wymaga ponownego połączenia'
                : 'Konto niepodłączone'}
          </Badge>
        </div>

        {isGoogleDriveConnected ? (
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <ReadOnlyItem
              label="Ostatni backup"
              value={backupSettings.googleDrive.lastBackupAt ? formatDateTime(backupSettings.googleDrive.lastBackupAt) : 'Jeszcze nie wykonano'}
            />
            <ReadOnlyItem
              label="Ważność połączenia"
              value={backupSettings.googleDrive.expiresAt ? formatDateTime(backupSettings.googleDrive.expiresAt) : 'Brak daty wygaśnięcia'}
            />
          </div>
        ) : (
          <Banner tone="warning" className="mt-4">
            {requiresGoogleDriveReauthorization
              ? 'Google Drive wymaga ponownego połączenia. Backup ręczny i automatyczny pozostają wstrzymane do czasu odnowienia autoryzacji.'
              : 'Google Drive nie jest jeszcze podłączony. Najpierw połącz konto, aby uruchamiać backup ręczny i harmonogram.'}
            <div className="mt-3">
              <a
                href={googleDriveConnectUrl}
                className="inline-flex h-10 items-center justify-center rounded-control bg-surface-panel px-4 text-sm font-semibold text-secondary-ink transition hover:bg-surface-raised"
              >
                {requiresGoogleDriveReauthorization ? 'Połącz ponownie Google Drive' : 'Połącz Google Drive'}
              </a>
            </div>
          </Banner>
        )}

        <form onSubmit={(event) => void handleSubmit(event)} className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 rounded-[1rem] border border-outline bg-surface/40 px-4 py-3">
            <label className="inline-flex items-center gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={automaticOnInvoiceIssued}
                onChange={(event) => setAutomaticOnInvoiceIssued(event.target.checked)}
                className="h-4 w-4 rounded border-outline text-primary focus:ring-primary/30"
                disabled={!isGoogleDriveConnected || saveBusy}
              />
              Automatycznie uruchamiaj backup po wystawieniu faktury
            </label>
          </div>

          <FormField label="Tryb harmonogramu" htmlFor="backup-schedule-mode">
            <Select
              id="backup-schedule-mode"
              value={scheduleMode}
              onChange={(event) => setScheduleMode(event.target.value as CompanyBackupScheduleMode)}
              disabled={!isGoogleDriveConnected || saveBusy}
            >
              <option value="MANUAL">Ręczny</option>
              <option value="DAILY">Codziennie</option>
              <option value="WEEKLY">Co tydzień</option>
            </Select>
          </FormField>

          <FormField label="Strefa czasowa" htmlFor="backup-schedule-timezone">
            <Input id="backup-schedule-timezone" value={backupSettings.policy.scheduleTimezone} disabled />
          </FormField>

          {scheduleMode !== 'MANUAL' ? (
            <>
              <FormField label="Godzina (0-23)" htmlFor="backup-schedule-hour" required>
                <Input
                  id="backup-schedule-hour"
                  type="number"
                  min={0}
                  max={23}
                  value={scheduleHour}
                  onChange={(event) => setScheduleHour(event.target.value)}
                  disabled={!isGoogleDriveConnected || saveBusy}
                  required
                />
              </FormField>

              <FormField label="Minuta (0-59)" htmlFor="backup-schedule-minute" required>
                <Input
                  id="backup-schedule-minute"
                  type="number"
                  min={0}
                  max={59}
                  value={scheduleMinute}
                  onChange={(event) => setScheduleMinute(event.target.value)}
                  disabled={!isGoogleDriveConnected || saveBusy}
                  required
                />
              </FormField>
            </>
          ) : null}

          {scheduleMode === 'WEEKLY' ? (
            <FormField label="Dzień tygodnia" htmlFor="backup-schedule-day-of-week" required>
              <Select
                id="backup-schedule-day-of-week"
                value={scheduleDayOfWeek}
                onChange={(event) => setScheduleDayOfWeek(event.target.value)}
                disabled={!isGoogleDriveConnected || saveBusy}
                required
              >
                <option value="">Wybierz dzień</option>
                <option value="1">Poniedziałek</option>
                <option value="2">Wtorek</option>
                <option value="3">Środa</option>
                <option value="4">Czwartek</option>
                <option value="5">Piątek</option>
                <option value="6">Sobota</option>
                <option value="7">Niedziela</option>
              </Select>
            </FormField>
          ) : null}

          <div className="md:col-span-2 flex flex-wrap gap-3">
            <Button type="submit" disabled={!isGoogleDriveConnected || saveBusy}>
              {saveBusy ? 'Zapisywanie…' : 'Zapisz politykę backupu'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleRunNow}
              disabled={!isGoogleDriveConnected || runBusy}
            >
              {runBusy ? 'Uruchamianie…' : 'Backup teraz'}
            </Button>
          </div>
        </form>

        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <ReadOnlyItem label="Polityka zaktualizowana" value={formatDateTime(backupSettings.policy.updatedAt)} />
          <ReadOnlyItem
            label="Ostatni ręczny backup"
            value={lastRunResult ? `${formatDateTime(lastRunResult.finishedAt)} · ${lastRunResult.filesCount} plików` : 'Brak uruchomień w tej sesji'}
          />
        </div>

        {lastRunResult ? (
          <div className="mt-4 rounded-[1rem] border border-outline bg-surface/40 p-4 text-sm">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Wynik ostatniego uruchomienia</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <ReadOnlyItem label="Backup run ID" value={lastRunResult.backupRunId} />
              <ReadOnlyItem label="Źródło wywołania" value={lastRunResult.triggerSource} />
              <ReadOnlyItem label="Rozpoczęcie" value={formatDateTime(lastRunResult.startedAt)} />
              <ReadOnlyItem label="Zakończenie" value={formatDateTime(lastRunResult.finishedAt)} />
              <ReadOnlyItem label="Liczba plików" value={String(lastRunResult.filesCount)} />
              <ReadOnlyItem label="Rozmiar łączny" value={formatBytes(lastRunResult.bytesTotal)} />
            </div>
          </div>
        ) : null}
      </div>

      <details className="rounded-[1.4rem] border border-outline bg-surface-raised/35 p-4">
        <summary className="cursor-pointer list-none text-sm font-semibold text-foreground marker:hidden">
          Zaawansowane szczegóły statusu backupu
        </summary>
        <div className="mt-4 space-y-4 border-t border-outline pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Status ogólny</p>
            <Badge tone={backupStatus ? overallStatusBadgeTone[backupStatus.overallStatus] : 'neutral'}>
              {backupStatus ? overallStatusLabel[backupStatus.overallStatus] : 'Niedostępny'}
            </Badge>
          </div>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <ReadOnlyItem
              label="Czas oceny statusu"
              value={backupStatus ? formatDateTime(backupStatus.evaluatedAt) : 'Brak danych'}
            />
            <ReadOnlyItem
              label="Automatyzacja polityki Google Drive"
              value={
                backupStatus
                  ? backupStatus.companyGoogleDrive.isPolicyAutomationEnabled
                    ? 'Włączona'
                    : 'Wyłączona'
                  : 'Brak danych'
              }
            />
            <ReadOnlyItem
              label="Status PostgreSQL"
              value={postgresqlStatus ? backupStatusLabel[postgresqlStatus.status] : 'Niedostępny'}
            />
            <ReadOnlyItem
              label="Kod przyczyny PostgreSQL"
              value={postgresqlStatus ? postgresqlReasonCodeLabel[postgresqlStatus.reasonCode] : 'Brak danych'}
            />
            <ReadOnlyItem
              label="Znacznik czasu artefaktu PostgreSQL"
              value={postgresqlStatus?.latestArtifactTimestamp ?? 'Brak danych'}
            />
            <ReadOnlyItem
              label="Najnowszy artefakt PostgreSQL"
              value={
                postgresqlStatus?.latestArtifactCreatedAt
                  ? formatDateTime(postgresqlStatus.latestArtifactCreatedAt)
                  : 'Brak danych'
              }
            />
            <ReadOnlyItem
              label="Wiek najnowszego artefaktu"
              value={formatHours(postgresqlStatus?.latestArtifactAgeHours ?? null)}
            />
            <ReadOnlyItem
              label="Maksymalny dozwolony wiek"
              value={postgresqlStatus ? `${postgresqlStatus.maxAllowedAgeHours} h` : 'Brak danych'}
            />
            <ReadOnlyItem
              label="Sprawdzenie artefaktów"
              value={postgresqlStatus ? formatDateTime(postgresqlStatus.checkedAt) : 'Brak danych'}
            />
            <ReadOnlyItem
              label="Połączenie Google Drive"
              value={
                googleDriveConnectionStatus === 'CONNECTED'
                  ? 'Połączony'
                  : googleDriveConnectionStatus === 'REAUTHORIZATION_REQUIRED'
                    ? 'Wymaga ponownego połączenia'
                    : 'Niepołączony'
              }
            />
          </div>
        </div>
      </details>
    </Surface>
  );
}

function ReadOnlyItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

const backupStatusLabel: Record<PlatformPostgresqlBackupStatus, string> = {
  FRESH: 'Świeży',
  STALE: 'Nieaktualny',
  MISSING: 'Brak backupu',
  INCOMPLETE: 'Niekompletny',
  UNAVAILABLE: 'Niedostępny',
};

const backupStatusBadgeTone: Record<PlatformPostgresqlBackupStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  FRESH: 'success',
  STALE: 'warning',
  MISSING: 'danger',
  INCOMPLETE: 'danger',
  UNAVAILABLE: 'neutral',
};

const overallStatusLabel: Record<CompanyBackupOverallStatus, string> = {
  HEALTHY: 'Prawidłowy',
  DEGRADED: 'Wymaga uwagi',
  CRITICAL: 'Krytyczny',
  UNKNOWN: 'Nieznany',
};

const overallStatusBadgeTone: Record<CompanyBackupOverallStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  HEALTHY: 'success',
  DEGRADED: 'warning',
  CRITICAL: 'danger',
  UNKNOWN: 'neutral',
};

const postgresqlReasonCodeLabel: Record<PlatformPostgresqlBackupReasonCode, string> = {
  OK: 'Dane poprawne',
  ARTIFACT_TOO_OLD: 'Artefakt jest za stary',
  ARTIFACT_NOT_FOUND: 'Nie znaleziono artefaktu',
  ARTIFACT_SET_INCOMPLETE: 'Zestaw artefaktów jest niekompletny',
  SOURCE_UNAVAILABLE: 'Źródło artefaktów jest niedostępne',
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatHours(value: number | null): string {
  if (value === null) {
    return 'Brak danych';
  }
  return `${value} h`;
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getGoogleDriveConnectionStatus(
  backupSettings: CompanyBackupSettings,
  statusConnectionStatus?: GoogleDriveConnectionStatus,
): GoogleDriveConnectionStatus {
  if (backupSettings.googleDrive.requiresReauthorization || statusConnectionStatus === 'REAUTHORIZATION_REQUIRED') {
    return 'REAUTHORIZATION_REQUIRED';
  }

  if (statusConnectionStatus === 'CONNECTED' || backupSettings.googleDrive.isConnected) {
    return 'CONNECTED';
  }

  return 'DISCONNECTED';
}

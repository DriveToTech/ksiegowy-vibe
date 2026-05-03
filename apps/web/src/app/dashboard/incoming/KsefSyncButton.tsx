'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { syncIncomingFromKsef } from '../../../lib/api-client';
import type { CompanyKsefCredentialStatus } from '../../../lib/api-types';
import { getActiveKsefEnvironmentFromBrowser } from '../../../lib/ksef-environment';
import { cn } from '../../../lib/cn';
import { Button } from '../../../components/atoms/Button';
import { Surface } from '../../../components/atoms/Surface';
import { t } from '../../../lib/translations';

const environmentBadgeClasses: Record<string, string> = {
  TEST: 'border-success/30 bg-success/15 text-success-ink',
  PRODUCTION: 'border-warning/40 bg-warning/15 text-warning-ink',
};

function EnvironmentBadge({ environment }: { environment: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
        environmentBadgeClasses[environment] ?? environmentBadgeClasses.TEST,
      )}
    >
      {environment}
    </span>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const firstDayOfMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

interface KsefSyncButtonProps {
  companyId: string;
  ksefCredentialStatuses?: CompanyKsefCredentialStatus[];
}

export function KsefSyncButton({ companyId, ksefCredentialStatuses }: KsefSyncButtonProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth());
  const [dateTo, setDateTo] = useState(today());
  const [isSyncing, setIsSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeEnvironment = getActiveKsefEnvironmentFromBrowser();
  const activeCredential = ksefCredentialStatuses?.find((credential) => credential.environment === activeEnvironment);
  const hasToken = activeCredential ? activeCredential.hasToken : true;

  const handleSync = async () => {
    if (activeEnvironment === 'PRODUCTION') {
      if (!window.confirm(t.incoming.ksefSync.productionConfirm)) return;
    }

    setIsSyncing(true);
    setResult(null);
    setError(null);

    await syncIncomingFromKsef(companyId, dateFrom, dateTo)
      .then((syncResult) => {
        setResult(t.incoming.ksefSync.success(syncResult.created, syncResult.linked, syncResult.skipped));
        router.refresh();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t.incoming.ksefSync.error);
      })
      .finally(() => {
        setIsSyncing(false);
      });
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setResult(null);
    setError(null);
  };

  return (
    <>
      <Surface tone="glass" shape="organic" className="flex h-full flex-col justify-between gap-5 p-5 sm:p-6">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">{t.incoming.ksefSync.eyebrow}</p>
          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {t.incoming.ksefSync.title}
          </h2>
          <p className="text-sm text-muted">{t.incoming.ksefSync.description}</p>
        </div>

        <div className="rounded-[1.75rem_1.25rem_2rem_1.25rem] bg-surface-raised/45 p-4 backdrop-blur-xl">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{t.incoming.ksefSync.helperLabel}</p>
          <p className="mt-2 text-sm text-foreground">{t.incoming.ksefSync.helperDescription}</p>
          <div className="pt-4">
            <Button
              type="button"
              onClick={() => setIsModalOpen(true)}
              aria-label={t.incoming.ksefSync.button}
            >
              {t.incoming.ksefSync.button}
            </Button>
          </div>
        </div>
      </Surface>

      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ksef-sync-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={(event) => { if (event.target === event.currentTarget) handleClose(); }}
        >
          <div className="w-full max-w-md rounded-2xl bg-surface-panel p-6 shadow-xl space-y-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 id="ksef-sync-title" className="font-display text-xl font-semibold tracking-tight text-foreground">
                {t.incoming.ksefSync.modalTitle}
              </h2>
              <EnvironmentBadge environment={activeEnvironment} />
            </div>
            <p className="text-sm text-muted">
              {t.incoming.ksefSync.modalDescription}
            </p>
          </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="ksef-sync-date-from" className="text-sm font-medium text-foreground">
                  {t.incoming.ksefSync.dateFrom}
                </label>
                <input
                  id="ksef-sync-date-from"
                  type="date"
                  value={dateFrom}
                  max={dateTo}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="ksef-sync-date-to" className="text-sm font-medium text-foreground">
                  {t.incoming.ksefSync.dateTo}
                </label>
                <input
                  id="ksef-sync-date-to"
                  type="date"
                  value={dateTo}
                  min={dateFrom}
                  max={today()}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
            </div>
            </div>

            <p className="text-sm text-muted">
              {t.incoming.ksefSync.environmentLabel}: <span className="font-semibold text-foreground">{activeEnvironment}</span>
            </p>

            {!hasToken && (
              <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-ink" role="alert">
                <p>{t.incoming.ksefSync.missingTokenWarning(activeEnvironment)}{' '}
                  <Link href="/dashboard/settings" className="font-semibold underline underline-offset-2 hover:no-underline">
                    {t.incoming.ksefSync.goToSettings}
                  </Link>
                </p>
              </div>
            )}

          {result !== null && (
              <p className="rounded-xl bg-success-soft/20 px-4 py-2 text-sm text-success-ink" role="status">
                {result}
              </p>
            )}

            {error !== null && (
              <p className="rounded-xl bg-error-soft/20 px-4 py-2 text-sm text-error-ink" role="alert">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <Button type="button" variant="ghost" onClick={handleClose} disabled={isSyncing}>
                {t.incoming.ksefSync.cancel}
              </Button>
            <Button
              type="button"
              onClick={() => { void handleSync(); }}
              disabled={isSyncing || !dateFrom || !dateTo || !hasToken}
            >
                {isSyncing ? t.incoming.ksefSync.syncing : t.incoming.ksefSync.confirm}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

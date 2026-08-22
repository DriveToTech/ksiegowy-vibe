'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { syncIncomingFromKsef } from '../../../lib/api-client';
import type { CompanyKsefCredentialStatus } from '../../../lib/api-types';
import { getActiveKsefEnvironmentFromBrowser } from '../../../lib/ksef-environment';
import { cn } from '../../../lib/cn';
import { Button } from '../../../components/atoms/Button';
import { Banner } from '../../../components/molecules/Banner';
import { t } from '../../../lib/translations';

const environmentBadgeClasses: Record<string, string> = {
  TEST: 'border-success bg-success text-success-ink',
  PRODUCTION: 'border-warning bg-warning text-warning-ink',
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
      <Button type="button" onClick={() => setIsModalOpen(true)} aria-label={t.incoming.ksefSync.button}>
        {t.incoming.ksefSync.button}
      </Button>

      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ksef-sync-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(8,10,20,0.72)] p-4"
          onClick={(event) => { if (event.target === event.currentTarget) handleClose(); }}
        >
          <div className="w-full max-w-md rounded-card border border-outline-strong bg-surface-panel p-6 space-y-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 id="ksef-sync-title" className="text-xl font-semibold tracking-tight text-foreground">
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
                  className="w-full rounded-control border border-outline-control bg-surface-raised px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:ring-2 focus-visible:ring-primary/40"
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
                  className="w-full rounded-control border border-outline-control bg-surface-raised px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:ring-2 focus-visible:ring-primary/40"
                />
            </div>
            </div>

            <p className="text-sm text-muted">
              {t.incoming.ksefSync.environmentLabel}: <span className="font-semibold text-foreground">{activeEnvironment}</span>
            </p>

            {!hasToken && (
              <Banner tone="warning">
                <p>{t.incoming.ksefSync.missingTokenWarning(activeEnvironment)}{' '}
                  <Link href="/dashboard/settings" className="font-semibold underline underline-offset-2 hover:no-underline">
                    {t.incoming.ksefSync.goToSettings}
                  </Link>
                </p>
              </Banner>
            )}

          {result !== null && <Banner tone="success">{result}</Banner>}

            {error !== null && <Banner tone="error">{error}</Banner>}

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

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { syncIncomingFromKsef } from '../../../lib/api-client';
import type { CompanyKsefCredentialStatus } from '../../../lib/api-types';
import type { KsefEnvironment } from '../../../lib/ksef-environment';
import { cn } from '../../../lib/cn';
import { Button } from '../../../components/atoms/Button';
import { Input } from '../../../components/atoms/Input';
import { NativeDialog } from '../../../components/atoms/NativeDialog';
import { Banner } from '../../../components/molecules/Banner';
import { t } from '../../../lib/translations';

const environmentBadgeClasses: Record<string, string> = {
  TEST: 'border-warning bg-warning text-warning-ink',
  PRODUCTION: 'border-error bg-error text-error-ink',
};

function EnvironmentBadge({ environment }: { environment: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
        environmentBadgeClasses[environment] ?? environmentBadgeClasses.TEST,
      )}
    >
      {environment === 'PRODUCTION' ? 'PRODUKCJA' : 'TEST'}
    </span>
  );
}

interface KsefSyncButtonProps {
  companyId: string;
  companyName: string;
  activeEnvironment: KsefEnvironment;
  initialDate: string;
  ksefCredentialStatuses?: CompanyKsefCredentialStatus[];
}

export function KsefSyncButton({ companyId, companyName, activeEnvironment, initialDate, ksefCredentialStatuses }: KsefSyncButtonProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState(`${initialDate.slice(0, 7)}-01`);
  const [dateTo, setDateTo] = useState(initialDate);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isProductionConfirmationOpen, setIsProductionConfirmationOpen] = useState(false);
  const [pendingSyncEnvironment, setPendingSyncEnvironment] = useState<KsefEnvironment | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeCredential = ksefCredentialStatuses?.find((credential) => credential.environment === activeEnvironment);
  const hasToken = activeCredential?.hasToken ?? false;

  const executeSync = async (requestEnvironment: KsefEnvironment = activeEnvironment) => {
    setIsSyncing(true);
    setResult(null);
    setError(null);

    await syncIncomingFromKsef(companyId, dateFrom, dateTo, requestEnvironment)
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

  const handleSync = () => {
    if (activeEnvironment === 'PRODUCTION') {
      setIsProductionConfirmationOpen(true);
      setPendingSyncEnvironment(activeEnvironment);
      return;
    }

    void executeSync(activeEnvironment);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setIsProductionConfirmationOpen(false);
    setPendingSyncEnvironment(null);
    setResult(null);
    setError(null);
  };

  return (
    <>
      <Button type="button" onClick={() => setIsModalOpen(true)} aria-label={t.incoming.ksefSync.button}>
        {t.incoming.ksefSync.button}
      </Button>

      <NativeDialog
        open={isModalOpen && !isProductionConfirmationOpen}
        onClose={handleClose}
        title={t.incoming.ksefSync.modalTitle}
        description={t.incoming.ksefSync.modalDescription}
      >
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">{t.incoming.ksefSync.environmentLabel}</span>
            <EnvironmentBadge environment={activeEnvironment} />
          </div>

          <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="ksef-sync-date-from" className="text-sm font-medium text-foreground">
                  {t.incoming.ksefSync.dateFrom}
                </label>
                <Input
                  id="ksef-sync-date-from"
                  type="date"
                  value={dateFrom}
                  max={dateTo}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="ksef-sync-date-to" className="text-sm font-medium text-foreground">
                  {t.incoming.ksefSync.dateTo}
                </label>
                <Input
                  id="ksef-sync-date-to"
                  type="date"
                  value={dateTo}
                  min={dateFrom}
                  max={initialDate}
                  onChange={(event) => setDateTo(event.target.value)}
                />
            </div>
          </div>

            {!hasToken && (
              <Banner tone="warning">
                <p>{t.incoming.ksefSync.missingTokenWarning(activeEnvironment)}{' '}
                  <Link href="/dashboard/settings" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-2 hover:no-underline">
                    {t.incoming.ksefSync.goToSettings}
                  </Link>
                </p>
              </Banner>
            )}

          {result !== null && <Banner tone="success">{result}</Banner>}

            {error !== null && <Banner tone="error">{error}</Banner>}

          <div className="flex justify-end gap-3 pt-1">
              <Button type="button" variant="ghost" data-dialog-cancel onClick={handleClose} disabled={isSyncing}>
                {t.incoming.ksefSync.cancel}
              </Button>
            <Button
                type="button"
                loading={isSyncing}
                onClick={handleSync}
                disabled={!dateFrom || !dateTo || !hasToken}
              >
                {isSyncing ? t.incoming.ksefSync.syncing : t.incoming.ksefSync.confirm}
              </Button>
          </div>
        </div>
      </NativeDialog>

      <NativeDialog
        open={isProductionConfirmationOpen}
        onClose={() => {
          setIsProductionConfirmationOpen(false);
          setPendingSyncEnvironment(null);
        }}
        title={t.incoming.ksefSync.productionConfirmTitle}
        description={t.incoming.ksefSync.productionConfirmDescription(companyName)}
      >
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            data-dialog-cancel
            onClick={() => {
              setIsProductionConfirmationOpen(false);
              setPendingSyncEnvironment(null);
            }}
          >
            {t.incoming.ksefSync.cancel}
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              setIsProductionConfirmationOpen(false);
              const requestEnvironment = pendingSyncEnvironment ?? activeEnvironment;
              setPendingSyncEnvironment(null);
              void executeSync(requestEnvironment);
            }}
          >
            {t.incoming.ksefSync.confirm}
          </Button>
        </div>
      </NativeDialog>
    </>
  );
}

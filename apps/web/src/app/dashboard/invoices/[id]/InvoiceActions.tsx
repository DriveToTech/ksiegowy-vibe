'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { issueInvoice, submitKsef, recordPayment, createCorrection, revertToDraft, sendInvoiceEmail, pdfUrl, checkKsefStatus } from '../../../../lib/api-client';
import type { CompanyKsefCredentialStatus, InvoiceStatus, KsefStatus } from '../../../../lib/api-types';
import { getActiveKsefEnvironmentFromBrowser } from '../../../../lib/ksef-environment';
import { cn } from '../../../../lib/cn';
import { Button } from '../../../../components/atoms/Button';
import { Input } from '../../../../components/atoms/Input';
import { Surface } from '../../../../components/atoms/Surface';
import { t } from '../../../../lib/translations';

const environmentBadgeClasses: Record<string, string> = {
  TEST: 'border-success/30 bg-success/15 text-success-ink',
  PRODUCTION: 'border-warning/40 bg-warning/15 text-warning-ink',
};

function EnvironmentBadge({ environment }: { environment: string }) {
  return (
    <span
      className={cn(
        'ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
        environmentBadgeClasses[environment] ?? environmentBadgeClasses.TEST,
      )}
    >
      {environment}
    </span>
  );
}

function resolveErrorTitle(message: string): string {
  if (message.includes('KSeF submission failed')) return t.invoiceActions.ksefSubmissionError;
  if (message.includes('no KSeF token configured')) return t.invoiceActions.ksefNoTokenError;
  if (message.includes('Invoice totals do not match')) return t.invoiceActions.ksefTotalsError;
  if (message.includes('FA(3) XML validation failed')) return t.invoiceActions.ksefXmlError;
  return t.invoiceActions.genericError;
}

function resolveErrorDetail(message: string): string | null {
  if (message.includes('failed before receiving a response') || message.includes('Check network connectivity')) {
    return t.invoiceActions.ksefNetworkError;
  }
  if (message.includes('no KSeF token configured')) return t.invoiceActions.ksefNoTokenDetail;
  if (message.includes('Invoice totals do not match')) return t.invoiceActions.ksefTotalsDetail;
  if (message.includes('FA(3) XML validation failed')) {
    return message.split('FA(3) XML validation failed:')[1]?.trim() ?? null;
  }
  if (message.includes('KSeF submission failed:')) {
    return message.split('KSeF submission failed:')[1]?.trim() ?? null;
  }
  return null;
}

interface Props {
  companyId: string;
  invoiceId: string;
  invoiceType: string;
  status: InvoiceStatus;
  ksefStatus: KsefStatus;
  totalGross: string;
  paymentReceived: string;
  ksefCredentialStatuses?: CompanyKsefCredentialStatus[];
}

export default function InvoiceActions({ companyId, invoiceId, invoiceType, status, ksefStatus, totalGross, paymentReceived, ksefCredentialStatuses }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(totalGross);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionImpactType, setCorrectionImpactType] = useState('');
  const [correctionMode, setCorrectionMode] = useState<'cancellation' | 'formal'>('cancellation');
  const [correctedInvoiceNumber, setCorrectedInvoiceNumber] = useState('');
  const isCorrectionInvoice = invoiceType === 'KOR';

  const activeEnvironment = getActiveKsefEnvironmentFromBrowser();
  const activeCredential = ksefCredentialStatuses?.find((credential) => credential.environment === activeEnvironment);
  const hasToken = activeCredential ? activeCredential.hasToken : true;

  const handleIssue = () => {
    setError(null);
    setLoading('issue');
    issueInvoice(companyId, invoiceId)
      .then(() => router.refresh())
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(null));
  };

  const handleSubmitKsef = () => {
    if (activeEnvironment === 'PRODUCTION') {
      if (!window.confirm(t.invoiceActions.productionConfirm)) return;
    }
    setError(null);
    setLoading('ksef');
    submitKsef(companyId, invoiceId)
      .then((result) => {
        if (result.ksefReference) {
          setSuccess(`${t.invoiceActions.ksefSentAccepted} ${result.ksefReference}`);
        } else {
          setSuccess(t.invoiceActions.ksefSentPending);
        }
        router.refresh();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(null));
  };

  const handleCheckKsefStatus = () => {
    setError(null);
    setLoading('ksef-check');
    checkKsefStatus(companyId, invoiceId)
      .then((result) => {
        if (result.status === 'accepted') {
          setSuccess(`${t.invoiceActions.ksefStatusAccepted} ${result.ksefReferenceNumber ?? ''}`);
        } else if (result.status === 'rejected') {
          setError(t.invoiceActions.ksefStatusRejected);
        } else {
          setSuccess(t.invoiceActions.ksefStatusPending);
        }
        router.refresh();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(null));
  };

  const handleEdit = () => {
    setError(null);
    setLoading('edit');
    revertToDraft(companyId, invoiceId)
      .then(() => router.refresh())
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(null));
  };

  const handleCorrect = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeEnvironment === 'PRODUCTION') {
      if (!window.confirm(t.invoiceActions.productionConfirm)) return;
    }
    const normalizedCorrectedInvoiceNumber = correctedInvoiceNumber.trim();
    const normalizedCorrectionReason = correctionReason.trim();
    if (correctionMode === 'formal' && !normalizedCorrectedInvoiceNumber && !normalizedCorrectionReason) {
      setError(t.invoiceActions.correctionFormalRequiresData);
      return;
    }
    setError(null);
    setLoading('correct');
    createCorrection(companyId, invoiceId, {
      ...(normalizedCorrectionReason ? { reason: normalizedCorrectionReason } : {}),
      ...(correctionImpactType ? { impactType: correctionImpactType } : {}),
      correctionMode,
      ...(correctionMode === 'formal' && normalizedCorrectedInvoiceNumber ? { correctedInvoiceNumber: normalizedCorrectedInvoiceNumber } : {})
    })
      .then((correction) => router.push(`/dashboard/invoices/${correction.id}`))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => { setLoading(null); setShowCorrectionModal(false); });
  };

  const handleSendEmail = () => {
    setError(null);
    setLoading('email');
    sendInvoiceEmail(companyId, invoiceId)
      .then(() => { setSuccess(t.invoiceActions.emailSent); setTimeout(() => setSuccess(null), 5000); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(null));
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading('payment');
    recordPayment(companyId, invoiceId, paymentAmount)
      .then(() => { setShowPayment(false); router.refresh(); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(null));
  };

  const canRecordPayment = status === 'ISSUED';
  const isPaid = parseFloat(paymentReceived) >= parseFloat(totalGross) && parseFloat(totalGross) > 0;

  const errorTitle = error ? resolveErrorTitle(error) : null;
  const errorDetail = error ? resolveErrorDetail(error) : null;

  return (
    <div className="space-y-4">
      {error && (
        <Surface tone="glass" shape="organic" className="border-error/20 bg-error-soft/70 px-4 py-3 text-error-ink" role="alert">
          <p className="text-sm font-semibold">{errorTitle}</p>
          {errorDetail && <p className="mt-1 text-sm opacity-85">{errorDetail}</p>}
        </Surface>
      )}
      {success && (
        <Surface tone="glass" shape="organic" className="border-success/20 bg-success/25 px-4 py-3 text-sm text-success-ink">
          {success}
        </Surface>
      )}
      <div className="flex flex-wrap gap-3">
        {status === 'DRAFT' && (
          <>
            <Button onClick={handleIssue} disabled={loading === 'issue'}>
              {loading === 'issue'
                ? t.invoiceActions.issuing
                : isCorrectionInvoice
                  ? t.invoiceActions.issueCorrection
                  : t.invoiceActions.issue}
            </Button>
            <Link
              href={`/dashboard/invoices/${invoiceId}/edit`}
              className="inline-flex h-11 items-center justify-center rounded-full bg-surface-panel/70 px-4 text-sm font-semibold text-secondary-ink backdrop-blur-xl transition hover:bg-surface-raised/80"
            >
              {t.invoiceActions.editInvoice}
            </Link>
          </>
        )}
        {status === 'ISSUED' && ksefStatus === 'not_submitted' && (
          <Button onClick={handleEdit} disabled={loading === 'edit'} variant="secondary">
            {loading === 'edit' ? t.invoiceActions.editing : t.invoiceActions.editInvoice}
          </Button>
        )}
  {status === 'ISSUED' && ksefStatus === 'not_submitted' && (
  <Button onClick={handleSubmitKsef} disabled={loading === 'ksef' || !hasToken}>
    {loading === 'ksef'
      ? t.invoiceActions.submittingKsef
      : isCorrectionInvoice
      ? t.invoiceActions.submitCorrectionKsef
      : t.invoiceActions.submitKsef}
    <EnvironmentBadge environment={activeEnvironment} />
  </Button>
)}
  {ksefStatus === 'pending' && (
  <Button onClick={handleCheckKsefStatus} disabled={loading === 'ksef-check' || !hasToken} variant="secondary">
    {loading === 'ksef-check' ? t.invoiceActions.checkingKsefStatus : t.invoiceActions.checkKsefStatus}
    <EnvironmentBadge environment={activeEnvironment} />
  </Button>
)}
  {ksefStatus === 'accepted' && (
  <Button onClick={() => setShowCorrectionModal(true)} disabled={loading === 'correct' || !hasToken} variant="secondary">
    {t.invoiceActions.correctInvoice}
    <EnvironmentBadge environment={activeEnvironment} />
  </Button>
)}
        {canRecordPayment && !isPaid && (
          <Button onClick={() => setShowPayment((value) => !value)} variant="secondary">
            {t.invoiceActions.recordPayment}
          </Button>
        )}
        {isPaid && (
          <span className="inline-flex min-h-11 items-center rounded-md bg-success/25 px-4 text-sm font-semibold text-success-ink">
            {t.invoiceActions.paid}
          </span>
        )}
        {status === 'ISSUED' && (
          <>
            <a
              href={pdfUrl(companyId, invoiceId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-full bg-surface-panel/70 px-4 text-sm font-semibold text-secondary-ink backdrop-blur-xl transition hover:bg-surface-raised/80"
            >
              {t.invoiceActions.downloadPdf}
            </a>
            <Button onClick={handleSendEmail} disabled={loading === 'email'} variant="secondary">
              {loading === 'email' ? t.invoiceActions.sendingEmail : t.invoiceActions.sendEmail}
            </Button>
          </>
        )}
      </div>

      {!hasToken && (
        <Surface tone="glass" shape="organic" className="border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-ink" role="alert">
          <p>{t.invoiceActions.missingTokenWarning(activeEnvironment)}{' '}
            <Link href="/dashboard/settings" className="font-semibold underline underline-offset-2 hover:no-underline">
              {t.invoiceActions.goToSettings}
            </Link>
          </p>
        </Surface>
      )}

      {showPayment && (
        <Surface tone="glass" shape="organic" className="space-y-4 p-4">
          <form onSubmit={handleRecordPayment} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="min-w-[180px] flex-1">
              <label className="mb-2 block text-sm font-semibold text-foreground">
                {t.invoiceActions.paymentAmountLabel}
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                required
                className="tabular-nums"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={loading === 'payment'}>
                {loading === 'payment' ? t.invoiceActions.saving : t.invoiceActions.save}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowPayment(false)}>
                {t.invoiceActions.cancel}
              </Button>
            </div>
          </form>
        </Surface>
      )}

      {showCorrectionModal && (
        <Surface tone="glass" shape="organic" className="space-y-4 p-5">
          <h3 className="text-base font-semibold text-foreground">{t.invoiceActions.correctionModalTitle}</h3>
          <form onSubmit={handleCorrect} className="space-y-4">
            <div>
              <label htmlFor="correctionMode" className="mb-2 block text-sm font-semibold text-foreground">
                {t.invoiceActions.correctionModeLabel}
              </label>
              <select
                id="correctionMode"
                value={correctionMode}
                onChange={(e) => setCorrectionMode(e.target.value as 'cancellation' | 'formal')}
                className="w-full rounded-xl border border-border bg-surface-panel px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="cancellation">{t.invoiceActions.correctionModeCancellation}</option>
                <option value="formal">{t.invoiceActions.correctionModeFormal}</option>
              </select>
            </div>
            {correctionMode === 'formal' ? (
              <div>
                <label htmlFor="correctedInvoiceNumber" className="mb-2 block text-sm font-semibold text-foreground">
                  {t.invoiceActions.correctedInvoiceNumberLabel}
                </label>
                <Input
                  id="correctedInvoiceNumber"
                  type="text"
                  value={correctedInvoiceNumber}
                  onChange={(e) => setCorrectedInvoiceNumber(e.target.value)}
                  placeholder={t.invoiceActions.correctedInvoiceNumberPlaceholder}
                />
              </div>
            ) : null}
            <div>
              <label htmlFor="correctionReason" className="mb-2 block text-sm font-semibold text-foreground">
                {t.invoiceActions.correctionReasonLabel}
              </label>
              <Input
                id="correctionReason"
                type="text"
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder=""
              />
            </div>
            <div>
              <label htmlFor="correctionImpactType" className="mb-2 block text-sm font-semibold text-foreground">
                {t.invoiceActions.correctionImpactTypeLabel}
              </label>
              <select
                id="correctionImpactType"
                value={correctionImpactType}
                onChange={(e) => setCorrectionImpactType(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-panel px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">{t.invoiceActions.correctionImpactTypePlaceholder}</option>
                <option value="1">{t.invoiceActions.correctionImpactType1}</option>
                <option value="2">{t.invoiceActions.correctionImpactType2}</option>
                <option value="3">{t.invoiceActions.correctionImpactType3}</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={loading === 'correct'}>
                {loading === 'correct' ? t.invoiceActions.correcting : t.invoiceActions.correctionConfirm}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowCorrectionModal(false)}>
                {t.invoiceActions.cancel}
              </Button>
            </div>
          </form>
        </Surface>
      )}
    </div>
  );
}

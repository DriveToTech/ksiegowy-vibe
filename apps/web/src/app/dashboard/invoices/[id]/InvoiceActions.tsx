'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { issueInvoice, submitKsef, recordPayment, createCorrection, revertToDraft, sendInvoiceEmail, pdfUrl, checkKsefStatus } from '../../../../lib/api-client';
import type { CompanyKsefCredentialStatus, InvoiceStatus, KsefStatus } from '../../../../lib/api-types';
import { getActiveKsefEnvironmentFromBrowser } from '../../../../lib/ksef-environment';
import { cn } from '../../../../lib/cn';
import { Button } from '../../../../components/atoms/Button';
import { Input } from '../../../../components/atoms/Input';
import { Surface } from '../../../../components/atoms/Surface';
import { Banner } from '../../../../components/molecules/Banner';
import { formatMoney } from '../../../../lib/format';
import { t } from '../../../../lib/translations';

const environmentBadgeClasses: Record<string, string> = {
  TEST: 'border-success bg-success text-success-ink',
  PRODUCTION: 'border-warning bg-warning text-warning-ink',
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

function ProductionConfirmPanel({
  invoiceNumber,
  totalGross,
  confirmLabel,
  confirmingLabel,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  invoiceNumber: string | null;
  totalGross: string;
  confirmLabel: string;
  confirmingLabel: string;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-warning-ink">{t.invoiceActions.productionConfirmTitle}</h3>
        <p className="text-sm text-muted">{t.invoiceActions.productionConfirmDescription}</p>
      </div>
      <dl className="grid gap-3 rounded-card bg-surface-raised p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{t.invoiceActions.productionConfirmInvoiceNumberLabel}</dt>
          <dd className="mt-1 font-semibold text-foreground">{invoiceNumber ?? t.invoiceActions.productionConfirmInvoiceNumberFallback}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{t.invoiceActions.productionConfirmAmountLabel}</dt>
          <dd className="mt-1 font-semibold tabular-nums text-foreground">{formatMoney(totalGross)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{t.invoiceActions.productionConfirmEnvironmentLabel}</dt>
          <dd className="mt-1">
            <EnvironmentBadge environment="PRODUCTION" />
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={onCancel} autoFocus>
          {t.invoiceActions.productionConfirmCancel}
        </Button>
        <Button type="button" variant="secondary" onClick={onConfirm} disabled={isSubmitting}>
          {isSubmitting ? confirmingLabel : confirmLabel}
        </Button>
      </div>
    </div>
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
  invoiceNumber: string | null;
  invoiceType: string;
  status: InvoiceStatus;
  ksefStatus: KsefStatus;
  totalGross: string;
  paymentReceived: string;
  ksefCredentialStatuses?: CompanyKsefCredentialStatus[];
}

export default function InvoiceActions({ companyId, invoiceId, invoiceNumber, invoiceType, status, ksefStatus, totalGross, paymentReceived, ksefCredentialStatuses }: Props) {
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
  const [pendingProductionAction, setPendingProductionAction] = useState<'ksef' | 'correct' | null>(null);
  const isCorrectionInvoice = invoiceType === 'KOR';
  const isSubmitKsefInFlight = useRef(false);
  const isCorrectInFlight = useRef(false);

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
      setPendingProductionAction('ksef');
      return;
    }
    performSubmitKsef();
  };

  const performSubmitKsef = () => {
    if (isSubmitKsefInFlight.current) return;
    isSubmitKsefInFlight.current = true;
    setPendingProductionAction(null);
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
      .finally(() => { setLoading(null); isSubmitKsefInFlight.current = false; });
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
    const normalizedCorrectedInvoiceNumber = correctedInvoiceNumber.trim();
    const normalizedCorrectionReason = correctionReason.trim();
    if (correctionMode === 'formal' && !normalizedCorrectedInvoiceNumber && !normalizedCorrectionReason) {
      setError(t.invoiceActions.correctionFormalRequiresData);
      return;
    }
    if (activeEnvironment === 'PRODUCTION') {
      setPendingProductionAction('correct');
      return;
    }
    performCorrect();
  };

  const performCorrect = () => {
    if (isCorrectInFlight.current) return;
    isCorrectInFlight.current = true;
    const normalizedCorrectedInvoiceNumber = correctedInvoiceNumber.trim();
    const normalizedCorrectionReason = correctionReason.trim();
    setPendingProductionAction(null);
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
      .finally(() => { setLoading(null); setShowCorrectionModal(false); isCorrectInFlight.current = false; });
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
      <div className="flex items-center gap-2 text-sm text-muted">
        <span>{t.invoiceActions.activeEnvironmentLabel}</span>
        <EnvironmentBadge environment={activeEnvironment} />
      </div>
      {error && (
        <Banner tone="error">
          <p className="text-sm font-semibold">{errorTitle}</p>
          {errorDetail && <p className="mt-1 text-sm opacity-85">{errorDetail}</p>}
        </Banner>
      )}
      {success && <Banner tone="success">{success}</Banner>}
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
              className="inline-flex h-11 items-center justify-center rounded-control bg-secondary-surface px-4 text-sm font-semibold text-secondary-ink transition hover:bg-surface-raised"
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
          <span className="inline-flex min-h-11 items-center rounded-md bg-success px-4 text-sm font-semibold text-success-ink">
            {t.invoiceActions.paid}
          </span>
        )}
        {status === 'ISSUED' && (
          <>
            <a
              href={pdfUrl(companyId, invoiceId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-control bg-secondary-surface px-4 text-sm font-semibold text-secondary-ink transition hover:bg-surface-raised"
            >
              {t.invoiceActions.downloadPdf}
            </a>
            <Button onClick={handleSendEmail} disabled={loading === 'email'} variant="secondary">
              {loading === 'email' ? t.invoiceActions.sendingEmail : t.invoiceActions.sendEmail}
            </Button>
          </>
        )}
      </div>

      {pendingProductionAction === 'ksef' && (
        <Banner tone="warning" className="p-5">
          <ProductionConfirmPanel
            invoiceNumber={invoiceNumber}
            totalGross={totalGross}
            confirmLabel={isCorrectionInvoice ? t.invoiceActions.submitCorrectionKsef : t.invoiceActions.submitKsef}
            confirmingLabel={t.invoiceActions.submittingKsef}
            isSubmitting={loading === 'ksef'}
            onCancel={() => setPendingProductionAction(null)}
            onConfirm={performSubmitKsef}
          />
        </Banner>
      )}

      {!hasToken && (
        <Banner tone="warning">
          <p>{t.invoiceActions.missingTokenWarning(activeEnvironment)}{' '}
            <Link href="/dashboard/settings" className="font-semibold underline underline-offset-2 hover:no-underline">
              {t.invoiceActions.goToSettings}
            </Link>
          </p>
        </Banner>
      )}

      {showPayment && (
        <Surface tone="panel" className="space-y-4 p-4">
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

      {showCorrectionModal && pendingProductionAction === 'correct' && (
        <Banner tone="warning" className="p-5">
          <ProductionConfirmPanel
            invoiceNumber={invoiceNumber}
            totalGross={totalGross}
            confirmLabel={t.invoiceActions.correctionConfirm}
            confirmingLabel={t.invoiceActions.correcting}
            isSubmitting={loading === 'correct'}
            onCancel={() => setPendingProductionAction(null)}
            onConfirm={performCorrect}
          />
        </Banner>
      )}

      {showCorrectionModal && pendingProductionAction !== 'correct' && (
        <Surface tone="panel" className="space-y-4 p-5">
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
                className="w-full rounded-control border border-outline-control bg-surface-raised px-3 py-2 text-sm text-foreground focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
                className="w-full rounded-control border border-outline-control bg-surface-raised px-3 py-2 text-sm text-foreground focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
              <Button type="button" variant="ghost" onClick={() => { setShowCorrectionModal(false); setPendingProductionAction(null); }}>
                {t.invoiceActions.cancel}
              </Button>
            </div>
          </form>
        </Surface>
      )}
    </div>
  );
}

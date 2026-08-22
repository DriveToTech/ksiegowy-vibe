'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE } from '../../../../lib/api-base';
import type { IncomingInvoiceDetail, IncomingInvoiceStatus } from '../../../../lib/api-types';
import { getActiveKsefEnvironmentFromBrowser, KSEF_ENVIRONMENT_HEADER_NAME } from '../../../../lib/ksef-environment';
import { Button } from '../../../../components/atoms/Button';
import { Input } from '../../../../components/atoms/Input';
import { Surface } from '../../../../components/atoms/Surface';
import { Textarea } from '../../../../components/atoms/Textarea';
import { FormField } from '../../../../components/molecules/FormField';
import { IncomingStatusChip, InvoiceEnvironmentChip } from '../../../../components/molecules/StatusChip';
import { t } from '../../../../lib/translations';

interface Props {
  invoice: IncomingInvoiceDetail;
  companyId: string;
}

const TERMINAL_STATUSES = new Set(['OCR_DONE', 'OCR_FAILED', 'CONFIRMED', 'REJECTED']);

export function ReviewPanel({ invoice: initial, companyId }: Props) {
  const router = useRouter();
  const [invoice, setInvoice] = useState(initial);
  const [form, setForm] = useState({
    invoiceNumber: initial.invoiceNumber ?? '',
    issueDate: initial.issueDate ?? '',
    totalNet: initial.totalNet ?? '',
    totalVat: initial.totalVat ?? '',
    totalGross: initial.totalGross ?? '',
    currency: initial.currency ?? 'PLN',
    notes: initial.notes ?? '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const evtRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (TERMINAL_STATUSES.has(invoice.status)) return;

    const es = new EventSource(
      `${API_BASE}/companies/${companyId}/incoming/${invoice.id}/ocr-status`,
      { withCredentials: true }
    );

    es.onmessage = (evt) => {
      const data = JSON.parse(evt.data as string) as { status: IncomingInvoiceStatus; ocrError?: string | null };
      setInvoice((prev) => ({ ...prev, status: data.status, ocrError: data.ocrError ?? prev.ocrError }));

      if (TERMINAL_STATUSES.has(data.status)) {
        es.close();
        router.refresh();
      }
    };

    es.onerror = () => { es.close(); };
    evtRef.current = es;

    return () => { es.close(); };
  }, [invoice.id, invoice.status, companyId, router]);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);

    const response = await fetch(`${API_BASE}/companies/${companyId}/incoming/${invoice.id}/confirm`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        [KSEF_ENVIRONMENT_HEADER_NAME]: getActiveKsefEnvironmentFromBrowser(),
      },
      body: JSON.stringify({
        ...(form.invoiceNumber && { invoiceNumber: form.invoiceNumber }),
        ...(form.issueDate && { issueDate: form.issueDate }),
        ...(form.totalNet && { totalNet: form.totalNet }),
        ...(form.totalVat && { totalVat: form.totalVat }),
        ...(form.totalGross && { totalGross: form.totalGross }),
        ...(form.currency && { currency: form.currency }),
        ...(form.notes && { notes: form.notes }),
      }),
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : t.review.confirmFailed);
      setSubmitting(false);
      return null;
    });

    if (!response) return;

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      setError(`${t.review.confirmFailed}: ${response.status} ${text}`);
      setSubmitting(false);
      return;
    }

    router.push('/dashboard/incoming');
  };

  const handleReject = async () => {
    if (!window.confirm(t.review.rejectPrompt)) return;
    setSubmitting(true);

    const response = await fetch(`${API_BASE}/companies/${companyId}/incoming/${invoice.id}/reject`, {
      method: 'POST',
      credentials: 'include',
      headers: { [KSEF_ENVIRONMENT_HEADER_NAME]: getActiveKsefEnvironmentFromBrowser() },
    }).catch(() => null);

    if (response?.ok) {
      router.push('/dashboard/incoming');
    } else {
      setError(t.review.rejectFailed);
      setSubmitting(false);
    }
  };

  const isEditable = invoice.status === 'OCR_DONE' || invoice.status === 'OCR_FAILED' || invoice.status === 'UPLOADED';
  const scanFile = invoice.fileRecords.find((f) => f.type === 'incoming_scan');

  const formFields: [keyof typeof form, string][] = [
    ['invoiceNumber', t.review.fields.invoiceNumber],
    ['issueDate', t.review.fields.issueDate],
    ['totalNet', t.review.fields.totalNet],
    ['totalVat', t.review.fields.totalVat],
    ['totalGross', t.review.fields.totalGross],
    ['currency', t.review.fields.currency],
    ['notes', t.review.fields.notes],
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
      <Surface tone="panel" className="overflow-hidden xl:mr-6">
        <div className="border-b border-outline px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{t.review.documentPanel}</p>
              <p className="mt-1 text-sm text-muted">Podgląd przesłanego dokumentu źródłowego.</p>
            </div>
            <IncomingStatusChip status={invoice.status} />
          </div>
        </div>

        {scanFile ? (
          <iframe
            src={`${API_BASE}/files/${scanFile.id}`}
            className="min-h-[540px] w-full border-0 bg-surface-raised xl:min-h-[780px]"
            title={t.review.documentPanel}
          />
        ) : (
          <div className="flex min-h-[400px] items-center justify-center p-6 text-sm text-muted">
            {t.review.noFile}
          </div>
        )}
      </Surface>

      <Surface tone="panel" className="flex flex-col overflow-hidden xl:translate-y-8">
        <div className="border-b border-outline px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">{t.review.ocrPanel}</p>
              <p className="mt-1 text-sm text-muted">Dane odczytane z dokumentu i przygotowane do zatwierdzenia.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <InvoiceEnvironmentChip environment={invoice.environment} />
              <OcrStatusLabel
                status={invoice.status}
                error={invoice.ocrError}
                model={invoice.ocrModel}
                confidence={invoice.ocrConfidence}
              />
            </div>
          </div>
        </div>

        <div className="space-y-6 p-5">
          <section className="grid gap-4 md:grid-cols-2">
            <InfoCard
              title={t.review.sellerSection}
              rows={[
                { label: 'Nazwa', value: invoice.sellerName ?? '—' },
                { label: t.review.fields.nip, value: invoice.sellerNip ?? '—' },
                { label: 'Adres', value: invoice.sellerAddress ?? '—' },
              ]}
            />
            <InfoCard
              title={t.review.buyerSection}
              rows={[
                { label: 'Nazwa', value: invoice.buyerName ?? '—' },
                { label: t.review.fields.nip, value: invoice.buyerNip ?? '—' },
              ]}
            />
          </section>

          <section className="space-y-4">
            <div>
              <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-muted">
                {t.review.invoiceSection}
              </h3>
            </div>

            {invoice.ksefReference && (
              <div className="rounded-control bg-surface-raised px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{t.review.ksefReferenceLabel}</p>
                <p className="mt-1 break-all font-mono text-sm text-foreground">{invoice.ksefReference}</p>
              </div>
            )}

            <div className="rounded-control bg-surface-raised px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{t.review.fields.environment}</p>
              <div className="mt-2">
                <InvoiceEnvironmentChip environment={invoice.environment} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {formFields.map(([key, label]) => {
                const isNotesField = key === 'notes';
                const inputType = key === 'issueDate' ? 'date' : key.includes('total') ? 'number' : 'text';

                return (
                  <FormField
                    key={key}
                    label={label}
                    className={isNotesField ? 'md:col-span-2' : undefined}
                  >
                    {isNotesField ? (
                      <Textarea
                        value={form[key]}
                        disabled={!isEditable || submitting}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, [key]: event.target.value }))
                        }
                        className="min-h-28"
                      />
                    ) : (
                      <Input
                        type={inputType}
                        value={form[key]}
                        disabled={!isEditable || submitting}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, [key]: event.target.value }))
                        }
                        step={inputType === 'number' ? '0.01' : undefined}
                        className={key.includes('total') ? 'tabular-nums' : ''}
                      />
                    )}
                  </FormField>
                );
              })}
            </div>
          </section>
        </div>

        <div className="border-t border-outline px-5 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {error ? <p className="text-sm text-error-ink">{error}</p> : <div />}

            <div className="flex flex-wrap gap-3">
              {isEditable ? (
                <>
                  <Button
                    type="button"
                    onClick={() => {
                      void handleConfirm();
                    }}
                    disabled={submitting}
                  >
                    {t.review.confirm}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      void handleReject();
                    }}
                    disabled={submitting}
                    variant="danger"
                  >
                    {t.review.reject}
                  </Button>
                </>
              ) : null}
              {invoice.status === 'CONFIRMED' ? (
                <span className="inline-flex min-h-11 items-center rounded-md bg-success px-4 text-sm font-semibold text-success-ink">
                  {t.review.confirmed}
                </span>
              ) : null}
              {invoice.status === 'REJECTED' ? (
                <span className="inline-flex min-h-11 items-center rounded-md bg-error px-4 text-sm font-semibold text-error-ink">
                  {t.review.rejected}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </Surface>
    </div>
  );
}

function OcrStatusLabel({ status, error, model, confidence }: {
  status: string; error: string | null; model: string | null; confidence: number | null;
}) {
  if (status === 'OCR_PROCESSING') {
    return <span className="text-sm font-medium text-warning-ink">{t.review.ocrProcessing}</span>;
  }

  if (status === 'OCR_FAILED') {
    return <span className="text-sm font-medium text-error-ink">{t.review.ocrFailed(error)}</span>;
  }

  if (status === 'OCR_DONE') {
    return <span className="text-sm font-medium text-success-ink">{t.review.ocrDone(model, confidence)}</span>;
  }

  return null;
}

function InfoCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <Surface tone="panel" className="space-y-3 p-4">
      <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-muted">{title}</h3>
      <div className="space-y-2 text-sm">
        {rows.map((row) => (
          <div key={`${title}-${row.label}`}>
            <span className="text-muted">{row.label}: </span>
            <span className="font-medium text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
    </Surface>
  );
}

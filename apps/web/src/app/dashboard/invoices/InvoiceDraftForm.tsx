'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { Contractor, ContractorServiceRate, ServiceTemplate } from '../../../lib/api-types';
import { createDraft, updateDraft } from '../../../lib/api-client';
import { Button } from '../../../components/atoms/Button';
import { Input } from '../../../components/atoms/Input';
import { Select } from '../../../components/atoms/Select';
import { Surface } from '../../../components/atoms/Surface';
import { Textarea } from '../../../components/atoms/Textarea';
import { ErrorState } from '../../../components/molecules/ErrorState';
import { FormField } from '../../../components/molecules/FormField';
import { VatBreakdownTable } from '../../../components/molecules/VatBreakdownTable';
import { InvoiceBuyerSection } from '../../../components/organisms/InvoiceBuyerSection';
import { InvoiceLineItemsEditor } from '../../../components/organisms/InvoiceLineItemsEditor';
import { calcLineTotals, type LineItem } from '../../../lib/invoice-line-calculation';
import { parseDecimalValue } from '../../../lib/format';
import { t } from '../../../lib/translations';
import type { KsefEnvironment } from '../../../lib/ksef-environment';

const dateLabelClassName = 'text-xs font-normal text-muted';
const dateInputClassName = 'font-mono md:h-11 md:px-3 md:py-2.5 md:text-[13px]';

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export interface InvoiceDraftValues {
  contractorId: string;
  issueDate: string;
  saleDate: string;
  paymentDueDate: string;
  paymentMethod: 'BANK_TRANSFER' | 'CASH';
  lines: LineItem[];
  notes: string;
}

export default function InvoiceDraftForm({
  companyId,
  activeEnvironment,
  contractors,
  serviceTemplates = [],
  contractorRates = [],
  initialDraft,
  invoiceId,
}: {
  companyId: string;
  activeEnvironment: KsefEnvironment;
  contractors: Contractor[];
  serviceTemplates?: ServiceTemplate[];
  contractorRates?: ContractorServiceRate[];
  initialDraft: InvoiceDraftValues;
  invoiceId?: string;
}) {
  const router = useRouter();
  const isEditing = invoiceId !== undefined;

  const [contractorId, setContractorId] = useState(initialDraft.contractorId);
  const [issueDate, setIssueDate] = useState(initialDraft.issueDate);
  const [saleDate, setSaleDate] = useState(initialDraft.saleDate);
  const [paymentDueDate, setPaymentDueDate] = useState(initialDraft.paymentDueDate);
  const [paymentMethod, setPaymentMethod] = useState(initialDraft.paymentMethod);
  const [lines, setLines] = useState<LineItem[]>(initialDraft.lines);
  const [notes, setNotes] = useState(initialDraft.notes);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buyerNipInvalid, setBuyerNipInvalid] = useState(false);

  const totals = calcLineTotals(lines);

  const blockers = useMemo(() => {
    const items: string[] = [];
    if (!contractorId) items.push(t.newInvoice.blockers.noContractor);
    if (buyerNipInvalid) items.push(t.newInvoice.blockers.invalidBuyerNip);
    const namedLines = lines.filter((l) => l.name.trim());
    if (namedLines.length === 0) items.push(t.newInvoice.blockers.noLineItems);
    const unpricedLines = namedLines.filter((l) => {
      const unitNetPrice = parseDecimalValue(l.unitNetPrice);
      return !l.unitNetPrice.trim() || unitNetPrice === null || unitNetPrice < 0;
    });
    if (unpricedLines.length > 0) items.push(t.newInvoice.blockers.invalidLinePrice);
    return items;
  }, [contractorId, buyerNipInvalid, lines]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!contractorId) {
      setError(t.newInvoice.contractorRequiredError);
      return;
    }

    const validLines = lines.filter((l) => l.name.trim() && l.unitNetPrice.trim());
    if (validLines.length === 0) {
      setError(t.newInvoice.lineItemRequiredError);
      return;
    }

    const parsedLines = validLines.map((l) => ({
      ...l,
      quantityValue: parseDecimalValue(l.quantity),
      unitNetPriceValue: parseDecimalValue(l.unitNetPrice),
    }));
    if (parsedLines.some((l) => (
      l.quantityValue === null ||
      l.unitNetPriceValue === null ||
      l.quantityValue < 0 ||
      l.unitNetPriceValue < 0
    ))) {
      setError(t.newInvoice.invalidLineNumberError);
      return;
    }

    setSubmitting(true);
    const draftBody = {
      contractorId,
      issueDate,
      ...(saleDate ? { saleDate } : {}),
      paymentDueDate,
      paymentMethod,
      notes: notes.trim() || undefined,
      lines: parsedLines.map((l, idx) => ({
        position: idx + 1,
        name: l.name,
        quantity: l.quantityValue!.toString(),
        unit: l.unit,
        unitNetPrice: l.unitNetPriceValue!.toString(),
        vatRate: l.vatRate,
      })),
    };
    const saved = isEditing
      ? updateDraft(companyId, invoiceId, draftBody, activeEnvironment)
      : createDraft(companyId, draftBody, activeEnvironment);
    saved
      .then((invoice) => router.push(`/dashboard/invoices/${invoice.id}`))
      .catch((err) => {
        setError(err instanceof Error ? err.message : t.newInvoice.unknownSaveError);
        setSubmitting(false);
      });
  };

  return (
    <div data-invoice-focus-layout className="@container">
    <form onSubmit={handleSubmit} noValidate className="grid gap-4 @[1100px]:grid-cols-[minmax(0,1fr)_372px] @[1100px]:items-start">
      <div className="flex flex-col gap-4">
        {error ? <ErrorState message={error} /> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <InvoiceBuyerSection
            contractors={contractors}
            contractorId={contractorId}
            onContractorChange={setContractorId}
            onBuyerNipInvalid={setBuyerNipInvalid}
          />

          <Surface tone="panel" className="flex flex-col gap-[11px] px-[18px] py-4">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.newInvoice.datesSectionEyebrow}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label={t.newInvoice.issueDateLabel} htmlFor="issueDate" required className="space-y-[5px]" labelClassName={dateLabelClassName}>
                <Input
                  id="issueDate"
                  type="date"
                  value={issueDate}
                  onChange={(e) => {
                    setIssueDate(e.target.value);
                    if (!isEditing && e.target.value) setPaymentDueDate(addDays(e.target.value, 14));
                  }}
                  required
                  className={dateInputClassName}
                />
              </FormField>
              <FormField label={t.newInvoice.saleDateLabel} htmlFor="saleDate" className="space-y-[5px]" labelClassName={dateLabelClassName}>
                <Input
                  id="saleDate"
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className={dateInputClassName}
                />
              </FormField>
              <FormField label={t.invoiceDetail.fields.paymentMethod} htmlFor="paymentMethod" className="space-y-[5px]" labelClassName={dateLabelClassName}>
                <Select
                  id="paymentMethod"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as 'BANK_TRANSFER' | 'CASH')}
                  className="md:h-11 md:px-3 md:py-2.5 md:text-[13px] md:font-normal"
                >
                  <option value="BANK_TRANSFER">{t.invoiceDetail.paymentMethods.BANK_TRANSFER}</option>
                  <option value="CASH">{t.invoiceDetail.paymentMethods.CASH}</option>
                </Select>
              </FormField>
              <FormField label={t.invoiceDetail.fields.paymentDueDate} htmlFor="paymentDueDate" required className="space-y-[5px]" labelClassName={dateLabelClassName}>
                <Input
                  id="paymentDueDate"
                  type="date"
                  value={paymentDueDate}
                  onChange={(e) => setPaymentDueDate(e.target.value)}
                  required
                  className={dateInputClassName}
                />
              </FormField>
            </div>
          </Surface>
        </div>

        <InvoiceLineItemsEditor
          lines={lines}
          onLinesChange={setLines}
          serviceTemplates={serviceTemplates}
          contractorRates={contractorRates}
          contractorId={contractorId}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Surface tone="panel" className="flex flex-col gap-[9px] px-[18px] py-4">
            <label htmlFor="notes" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              {t.newInvoice.notesTitle}
            </label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.newInvoice.notesPlaceholder}
              aria-describedby="notes-hint"
              rows={1}
              className="max-h-48 min-h-12! px-[13px]! py-[11px]! [field-sizing:content] md:min-h-[46px]! md:text-[13px]"
            />
            <p id="notes-hint" className="text-[12px] leading-[1.45] text-muted">
              {t.newInvoice.notesPdfHint} {t.newInvoice.notesKsefHint}
            </p>
          </Surface>

          <Surface tone="panel" className="flex flex-col gap-[11px] px-[18px] py-4">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.newInvoice.attachments.title}</h2>
            <button
              type="button"
              disabled
              aria-describedby="attachments-hint"
              className="min-h-12 w-full cursor-not-allowed rounded-control border border-outline bg-surface-raised px-[15px] text-sm text-foreground-disabled md:min-h-11"
            >
              {t.newInvoice.attachments.button}
            </button>
            <p id="attachments-hint" className="text-[12px] leading-[1.45] text-muted">{t.newInvoice.attachments.hint}</p>
          </Surface>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Surface tone="panel" className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">{t.newInvoice.summaryTitle}</h2>
          <VatBreakdownTable lines={lines} totals={totals} />
        </Surface>

        {blockers.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-inset border border-error-ink/30 bg-error px-3.5 py-3">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="h-[7px] w-[7px] rounded-[2px] bg-error-ink" />
              <p className="text-sm font-medium text-error-ink">{t.newInvoice.blockersTitle(blockers.length)}</p>
            </div>
            <ul className="list-inside list-disc space-y-1 text-xs leading-relaxed text-foreground-secondary">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button type="submit" size="lg" disabled={submitting || blockers.length > 0}>
            {submitting ? t.newInvoice.savingButton : isEditing ? t.newInvoice.saveChangesButton : t.newInvoice.saveDraftButton}
          </Button>
          <Link
            href={isEditing ? `/dashboard/invoices/${invoiceId}` : '/dashboard/invoices'}
            className="inline-flex min-h-11 items-center justify-center text-center text-sm font-medium text-muted transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {t.newInvoice.cancelButton}
          </Link>
        </div>
      </div>
    </form>
    </div>
  );
}

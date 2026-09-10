'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { Contractor, ContractorServiceRate, ServiceTemplate } from '../../../../lib/api-types';
import { createDraft } from '../../../../lib/api-client';
import { Button } from '../../../../components/atoms/Button';
import { Input } from '../../../../components/atoms/Input';
import { Select } from '../../../../components/atoms/Select';
import { Surface } from '../../../../components/atoms/Surface';
import { Textarea } from '../../../../components/atoms/Textarea';
import { ErrorState } from '../../../../components/molecules/ErrorState';
import { FormField } from '../../../../components/molecules/FormField';
import { VatBreakdownTable } from '../../../../components/molecules/VatBreakdownTable';
import { calcLine, emptyLine, InvoiceLineItemsEditor, type LineItem } from '../../../../components/organisms/InvoiceLineItemsEditor';
import { parseDecimalValue } from '../../../../lib/format';
import { t } from '../../../../lib/translations';
import type { KsefEnvironment } from '../../../../lib/ksef-environment';

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── component ────────────────────────────────────────────────────────────────

export default function NewInvoiceForm({
  companyId,
  activeEnvironment,
  initialDate,
  defaultBankAccount,
  contractors,
  serviceTemplates = [],
  contractorRates = [],
}: {
  companyId: string;
  activeEnvironment: KsefEnvironment;
  initialDate: string;
  defaultBankAccount: string | null;
  contractors: Contractor[];
  serviceTemplates?: ServiceTemplate[];
  contractorRates?: ContractorServiceRate[];
}) {
  const router = useRouter();

  const [contractorId, setContractorId] = useState(contractors[0]?.id ?? '');
  const [issueDate, setIssueDate] = useState(initialDate);
  const [saleDate, setSaleDate] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState(addDays(initialDate, 14));
  const [paymentMethod, setPaymentMethod] = useState<'BANK_TRANSFER' | 'CASH'>('BANK_TRANSFER');
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [notes, setNotes] = useState('');
  const [bankAccount, setBankAccount] = useState(defaultBankAccount ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedContractor = contractors.find((c) => c.id === contractorId) ?? null;

  const totals = lines.reduce(
    (acc, line) => {
      const { net, vat, gross } = calcLine(line);
      return {
        net: Math.round((acc.net + net) * 100) / 100,
        vat: Math.round((acc.vat + vat) * 100) / 100,
        gross: Math.round((acc.gross + gross) * 100) / 100,
      };
    },
    { net: 0, vat: 0, gross: 0 },
  );

  const blockers = useMemo(() => {
    const items: string[] = [];
    if (!contractorId) items.push(t.newInvoice.blockers.noContractor);
    const namedLines = lines.filter((l) => l.name.trim());
    if (namedLines.length === 0) items.push(t.newInvoice.blockers.noLineItems);
    const unpricedLines = namedLines.filter((l) => {
      const unitNetPrice = parseDecimalValue(l.unitNetPrice);
      return !l.unitNetPrice.trim() || unitNetPrice === null || unitNetPrice < 0;
    });
    if (unpricedLines.length > 0) items.push(t.newInvoice.blockers.invalidLinePrice);
    return items;
  }, [contractorId, lines]);

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
    createDraft(companyId, {
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
    }, activeEnvironment)
      .then((invoice) => router.push(`/dashboard/invoices/${invoice.id}`))
      .catch((err) => {
        setError(err instanceof Error ? err.message : t.newInvoice.unknownSaveError);
        setSubmitting(false);
      });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
      <div className="space-y-6">
        {error ? <ErrorState message={error} /> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Surface tone="panel" className="space-y-3 p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.newInvoice.buyerSectionEyebrow}</h2>
            <FormField label={t.newInvoice.contractorLabel} htmlFor="contractorId" required className="space-y-1.5">
              <Select
                id="contractorId"
                value={contractorId}
                onChange={(e) => setContractorId(e.target.value)}
                required
              >
                <option value="">{t.newInvoice.contractorPlaceholder}</option>
                {contractors.map((contractor) => (
                  <option key={contractor.id} value={contractor.id}>
                    {contractor.name} ({contractor.nip ?? t.newInvoice.noNipFallback})
                  </option>
                ))}
              </Select>
            </FormField>
            {selectedContractor ? (
              <p className="text-xs leading-relaxed text-muted">
                {selectedContractor.nip ? `${t.invoiceDetail.fields.nip}: ${selectedContractor.nip}` : null}
                {selectedContractor.addressLine1 ? ` · ${selectedContractor.addressLine1}` : null}
              </p>
            ) : null}
          </Surface>

          <Surface tone="panel" className="space-y-3 p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.newInvoice.datesSectionEyebrow}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label={t.newInvoice.issueDateLabel} htmlFor="issueDate" required className="space-y-1.5">
                <Input
                  id="issueDate"
                  type="date"
                  value={issueDate}
                  onChange={(e) => {
                    setIssueDate(e.target.value);
                    if (e.target.value) setPaymentDueDate(addDays(e.target.value, 14));
                  }}
                  required
                />
              </FormField>
              <FormField label={t.newInvoice.saleDateLabel} htmlFor="saleDate" className="space-y-1.5">
                <Input
                  id="saleDate"
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                />
              </FormField>
              <FormField label={t.invoiceDetail.fields.paymentMethod} htmlFor="paymentMethod" className="space-y-1.5">
                <Select
                  id="paymentMethod"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as 'BANK_TRANSFER' | 'CASH')}
                >
                  <option value="BANK_TRANSFER">{t.invoiceDetail.paymentMethods.BANK_TRANSFER}</option>
                  <option value="CASH">{t.invoiceDetail.paymentMethods.CASH}</option>
                </Select>
              </FormField>
              <FormField label={t.invoiceDetail.fields.paymentDueDate} htmlFor="paymentDueDate" required className="space-y-1.5">
                <Input
                  id="paymentDueDate"
                  type="date"
                  value={paymentDueDate}
                  onChange={(e) => setPaymentDueDate(e.target.value)}
                  required
                />
              </FormField>
            </div>
          </Surface>
        </div>

        <Surface tone="panel" className="space-y-4 p-5">
          <h2 className="text-sm font-semibold text-foreground">{t.invoiceDetail.sections.lineItemsTitle}</h2>
          <InvoiceLineItemsEditor
            lines={lines}
            onLinesChange={setLines}
            serviceTemplates={serviceTemplates}
            contractorRates={contractorRates}
            contractorId={contractorId}
          />
        </Surface>

        <Surface tone="panel" className="space-y-3 p-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t.newInvoice.notesTitle}</h2>
            <p className="mt-1 text-xs text-muted">
              {t.newInvoice.notesPdfHint} <span className="font-medium text-foreground-secondary">{t.newInvoice.notesKsefHint}</span>
            </p>
          </div>
          <FormField label={t.newInvoice.notesTitle} htmlFor="notes">
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.newInvoice.notesPlaceholder}
              rows={4}
            />
          </FormField>
        </Surface>

        <Surface tone="panel" className="space-y-1.5 p-5">
          <FormField label={t.contractors.fields.bankAccount} htmlFor="bankAccount">
            <Input
              id="bankAccount"
              type="text"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              placeholder={t.newInvoice.bankAccountPlaceholder}
            />
          </FormField>
        </Surface>
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
            {submitting ? t.newInvoice.savingButton : t.newInvoice.saveDraftButton}
          </Button>
          <Link
            href="/dashboard/invoices"
            className="inline-flex min-h-11 items-center justify-center text-center text-sm font-medium text-muted transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {t.newInvoice.cancelButton}
          </Link>
        </div>
      </div>
    </form>
  );
}

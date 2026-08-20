'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── component ────────────────────────────────────────────────────────────────

export default function NewInvoiceForm({
  companyId,
  contractors,
  serviceTemplates = [],
  contractorRates = [],
}: {
  companyId: string;
  contractors: Contractor[];
  serviceTemplates?: ServiceTemplate[];
  contractorRates?: ContractorServiceRate[];
}) {
  const router = useRouter();
  const today = todayIso();

  const [contractorId, setContractorId] = useState(contractors[0]?.id ?? '');
  const [issueDate, setIssueDate] = useState(today);
  const [saleDate, setSaleDate] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState(addDays(today, 14));
  const [paymentMethod, setPaymentMethod] = useState<'BANK_TRANSFER' | 'CASH'>('BANK_TRANSFER');
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [notes, setNotes] = useState('');
  // TODO: submit bankAccount when API CreateDraftBody includes bankAccount
  const [bankAccount, setBankAccount] = useState('');
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
    if (parsedLines.some((l) => l.quantityValue === null || l.unitNetPriceValue === null)) {
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
    })
      .then((invoice) => router.push(`/dashboard/invoices/${invoice.id}`))
      .catch((err) => {
        setError(err instanceof Error ? err.message : t.newInvoice.unknownSaveError);
        setSubmitting(false);
      });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {error ? <ErrorState message={error} /> : null}

      {/* ── Section 1: Dane dokumentu ──────────────────────────────────────── */}
      <Surface tone="glass" shape="organic" className="space-y-4 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label={t.newInvoice.issueDateLabel} htmlFor="issueDate" required>
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

          <FormField label={t.newInvoice.saleDateLabel} htmlFor="saleDate">
            <Input
              id="saleDate"
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
            />
          </FormField>

          <FormField label={t.newInvoice.contractorLabel} htmlFor="contractorId" required>
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
        </div>

        {selectedContractor ? (
          <div className="rounded-[1rem] border border-outline/30 bg-surface-raised/30 px-4 py-2.5 text-sm">
            <span className="font-medium text-foreground">{selectedContractor.name}</span>
            {selectedContractor.nip ? (
              <span className="ml-3 text-muted">{t.invoiceDetail.fields.nip}: {selectedContractor.nip}</span>
            ) : null}
          </div>
        ) : null}
      </Surface>

      {/* ── Section 2: Pozycje faktury ─────────────────────────────────────── */}
      <Surface tone="glass" shape="organic" className="space-y-5 p-6">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {t.invoiceDetail.sections.lineItemsTitle}
        </h2>

        <InvoiceLineItemsEditor
          lines={lines}
          onLinesChange={setLines}
          serviceTemplates={serviceTemplates}
          contractorRates={contractorRates}
          contractorId={contractorId}
        />
      </Surface>

      {/* ── Section 3: Szczegóły płatności + Podsumowanie ─────────────────── */}
      <div className="grid gap-6 md:grid-cols-2">
        <Surface tone="glass" shape="organic" className="space-y-4 p-6">
          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
            {t.newInvoice.paymentDetailsTitle}
          </h2>

          <FormField label={t.invoiceDetail.fields.paymentMethod} htmlFor="paymentMethod">
            <Select
              id="paymentMethod"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as 'BANK_TRANSFER' | 'CASH')}
            >
              <option value="BANK_TRANSFER">{t.invoiceDetail.paymentMethods.BANK_TRANSFER}</option>
              <option value="CASH">{t.invoiceDetail.paymentMethods.CASH}</option>
            </Select>
          </FormField>

          <FormField label={t.invoiceDetail.fields.paymentDueDate} htmlFor="paymentDueDate" required>
            <Input
              id="paymentDueDate"
              type="date"
              value={paymentDueDate}
              onChange={(e) => setPaymentDueDate(e.target.value)}
              required
            />
          </FormField>

          {/* TODO: submit bankAccount when API CreateDraftBody includes bankAccount */}
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

        <Surface tone="glass" shape="organic" className="p-6">
          <h2 className="mb-4 font-display text-xl font-semibold tracking-tight text-foreground">
            {t.newInvoice.summaryTitle}
          </h2>
          <VatBreakdownTable lines={lines} totals={totals} />
        </Surface>
      </div>

      {/* ── Section 4: Uwagi do faktury ───────────────────────────────────── */}
      <Surface tone="glass" shape="organic" className="space-y-3 p-6">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
            {t.newInvoice.notesTitle}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {t.newInvoice.notesPdfHint}{' '}
            <span className="font-medium text-foreground">{t.newInvoice.notesKsefHint}</span>
          </p>
        </div>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t.newInvoice.notesPlaceholder}
          rows={4}
        />
      </Surface>

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? t.newInvoice.savingButton : t.newInvoice.saveDraftButton}
        </Button>
        <Link
          href="/dashboard/invoices"
          className="text-sm font-medium text-muted transition hover:text-foreground"
        >
          {t.newInvoice.cancelButton}
        </Link>
      </div>
    </form>
  );
}

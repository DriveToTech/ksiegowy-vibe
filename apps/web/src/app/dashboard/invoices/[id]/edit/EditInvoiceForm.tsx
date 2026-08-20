'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Contractor, ContractorServiceRate, InvoiceDetail, ServiceTemplate, VatRate } from '../../../../../lib/api-types';
import { updateDraft } from '../../../../../lib/api-client';
import { Button } from '../../../../../components/atoms/Button';
import { Input } from '../../../../../components/atoms/Input';
import { Select } from '../../../../../components/atoms/Select';
import { Surface } from '../../../../../components/atoms/Surface';
import { Textarea } from '../../../../../components/atoms/Textarea';
import { ErrorState } from '../../../../../components/molecules/ErrorState';
import { FormField } from '../../../../../components/molecules/FormField';
import { VatBreakdownTable } from '../../../../../components/molecules/VatBreakdownTable';
import { calcLine, emptyLine, InvoiceLineItemsEditor, type LineItem } from '../../../../../components/organisms/InvoiceLineItemsEditor';
import { t } from '../../../../../lib/translations';

export default function EditInvoiceForm({
  companyId,
  invoice,
  contractors,
  serviceTemplates = [],
  contractorRates = [],
}: {
  companyId: string;
  invoice: InvoiceDetail;
  contractors: Contractor[];
  serviceTemplates?: ServiceTemplate[];
  contractorRates?: ContractorServiceRate[];
}) {
  const router = useRouter();
  const allowsNegativeUnitNetPrice = invoice.invoiceType === 'KOR';

  const [contractorId, setContractorId] = useState(invoice.contractorId ?? contractors[0]?.id ?? '');
  const [issueDate, setIssueDate] = useState(invoice.issueDate);
  const [saleDate, setSaleDate] = useState(invoice.saleDate ?? '');
  const [paymentDueDate, setPaymentDueDate] = useState(invoice.paymentDueDate ?? '');
  const [paymentMethod, setPaymentMethod] = useState<'BANK_TRANSFER' | 'CASH'>(
    invoice.paymentMethod === 'CASH' ? 'CASH' : 'BANK_TRANSFER'
  );
  const [lines, setLines] = useState<LineItem[]>(
    invoice.lines.length > 0
      ? invoice.lines.map((l) => ({
          name: l.name,
          quantity: l.quantity,
          unit: l.unit ?? 'szt.',
          unitNetPrice: l.unitNetPrice,
          vatRate: l.vatRate as VatRate,
        }))
      : [emptyLine()]
  );
  const [notes, setNotes] = useState(invoice.notes ?? '');
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
      setError('Wybierz kontrahenta.');
      return;
    }

    const validLines = lines.filter((l) => l.name.trim() && l.unitNetPrice.trim());
    if (validLines.length === 0) {
      setError('Dodaj co najmniej jedną pozycję faktury.');
      return;
    }

    setSubmitting(true);
    updateDraft(companyId, invoice.id, {
      contractorId,
      issueDate,
      ...(saleDate ? { saleDate } : {}),
      paymentDueDate,
      paymentMethod,
      notes: notes.trim() || undefined,
      lines: validLines.map((l, idx) => ({
        position: idx + 1,
        name: l.name,
        quantity: l.quantity,
        unit: l.unit,
        unitNetPrice: l.unitNetPrice,
        vatRate: l.vatRate,
      })),
    })
      .then(() => router.push(`/dashboard/invoices/${invoice.id}`))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Nieznany błąd podczas zapisu.');
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
              onChange={(e) => setIssueDate(e.target.value)}
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

          <FormField label="Kontrahent" htmlFor="contractorId" required>
            <Select
              id="contractorId"
              value={contractorId}
              onChange={(e) => setContractorId(e.target.value)}
              required
            >
              <option value="">— wybierz kontrahenta —</option>
              {contractors.map((contractor) => (
                <option key={contractor.id} value={contractor.id}>
                  {contractor.name} ({contractor.nip ?? 'brak NIP'})
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        {selectedContractor ? (
          <div className="rounded-[1rem] border border-outline/30 bg-surface-raised/30 px-4 py-2.5 text-sm">
            <span className="font-medium text-foreground">{selectedContractor.name}</span>
            {selectedContractor.nip ? (
              <span className="ml-3 text-muted">NIP: {selectedContractor.nip}</span>
            ) : null}
          </div>
        ) : null}
      </Surface>

      {/* ── Section 2: Pozycje faktury ─────────────────────────────────────── */}
      <Surface tone="glass" shape="organic" className="space-y-5 p-6">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Pozycje faktury
        </h2>

        <InvoiceLineItemsEditor
          lines={lines}
          onLinesChange={setLines}
          serviceTemplates={serviceTemplates}
          contractorRates={contractorRates}
          contractorId={contractorId}
          allowsNegativeUnitNetPrice={allowsNegativeUnitNetPrice}
        />
      </Surface>

      {/* ── Section 3: Szczegóły płatności + Podsumowanie ─────────────────── */}
      <div className="grid gap-6 md:grid-cols-2">
        <Surface tone="glass" shape="organic" className="space-y-4 p-6">
          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
            Szczegóły płatności
          </h2>

          <FormField label="Forma płatności" htmlFor="paymentMethod">
            <Select
              id="paymentMethod"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as 'BANK_TRANSFER' | 'CASH')}
            >
              <option value="BANK_TRANSFER">Przelew</option>
              <option value="CASH">Gotówka</option>
            </Select>
          </FormField>

          <FormField label="Termin płatności" htmlFor="paymentDueDate" required>
            <Input
              id="paymentDueDate"
              type="date"
              value={paymentDueDate}
              onChange={(e) => setPaymentDueDate(e.target.value)}
              required
            />
          </FormField>
        </Surface>

        <Surface tone="glass" shape="organic" className="p-6">
          <h2 className="mb-4 font-display text-xl font-semibold tracking-tight text-foreground">
            Podsumowanie
          </h2>
          <VatBreakdownTable lines={lines} totals={totals} />
        </Surface>
      </div>

      {/* ── Section 4: Uwagi do faktury ───────────────────────────────────── */}
      <Surface tone="glass" shape="organic" className="space-y-3 p-6">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
            Uwagi do faktury
          </h2>
          <p className="mt-1 text-sm text-muted">
            Treść uwag zostanie wydrukowana na fakturze PDF.{' '}
            <span className="font-medium text-foreground">Nie jest przesyłana do KSeF.</span>
          </p>
        </div>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Opcjonalne uwagi, warunki, informacje dodatkowe…"
          rows={4}
        />
      </Surface>

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? 'Zapisywanie…' : 'Zapisz zmiany'}
        </Button>
        <Link
          href={`/dashboard/invoices/${invoice.id}`}
          className="text-sm font-medium text-muted transition hover:text-foreground"
        >
          Anuluj
        </Link>
      </div>
    </form>
  );
}

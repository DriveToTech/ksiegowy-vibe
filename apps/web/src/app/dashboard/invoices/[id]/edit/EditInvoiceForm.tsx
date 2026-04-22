'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
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
import { t } from '../../../../../lib/translations';

interface LineItem {
  name: string;
  quantity: string;
  unit: string;
  unitNetPrice: string;
  vatRate: VatRate;
}

const VAT_RATES: VatRate[] = ['23', '8', '5', '0', 'zw', 'np', 'oo'];

const VAT_RATE_LABELS: Record<VatRate, string> = {
  '23': '23%',
  '8': '8%',
  '5': '5%',
  '0': '0%',
  zw: 'zw.',
  np: 'np.',
  oo: 'oo.',
};

function emptyLine(): LineItem {
  return { name: '', quantity: '1', unit: 'szt.', unitNetPrice: '', vatRate: '23' };
}

function vatMultiplier(rate: VatRate): number {
  if (rate === 'zw' || rate === 'np' || rate === 'oo') return 0;
  return parseInt(rate, 10) / 100;
}

function calcLine(line: LineItem): { net: number; vat: number; gross: number } {
  const qty = parseFloat(line.quantity) || 0;
  const price = parseFloat(line.unitNetPrice) || 0;
  const net = Math.round(qty * price * 100) / 100;
  const vat = Math.round(net * vatMultiplier(line.vatRate) * 100) / 100;
  return { net, vat, gross: Math.round((net + vat) * 100) / 100 };
}

function formatPLN(value: number): string {
  return value.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' });
}

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

  const updateLine = useCallback(
    (index: number, field: keyof LineItem, value: string) => {
      setLines((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
    },
    [],
  );

  const addLine = useCallback(() => setLines((prev) => [...prev, emptyLine()]), []);

  const removeLine = useCallback(
    (index: number) => setLines((prev) => prev.filter((_, i) => i !== index)),
    [],
  );

  const applyTemplate = useCallback(
    (templateId: string, lineIndex: number) => {
      const template = serviceTemplates.find((tmpl) => tmpl.id === templateId);
      if (!template) return;

      const rate = contractorRates.find(
        (r) => r.serviceTemplateId === templateId && r.contractorId === contractorId,
      );

      setLines((prev) =>
        prev.map((line, i) =>
          i === lineIndex
            ? {
                ...line,
                name: template.name,
                unit: template.unit,
                vatRate: template.vatRate as VatRate,
                unitNetPrice: rate ? rate.unitNetPrice : line.unitNetPrice,
              }
            : line,
        ),
      );
    },
    [serviceTemplates, contractorRates, contractorId],
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

        {/* Desktop table */}
        <div className="hidden lg:block">
          {serviceTemplates.length > 0 ? (
            <p className="mb-3 text-xs text-muted">
              {t.newInvoice.catalogPickerButton}:
            </p>
          ) : null}
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col style={{ width: '29%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '7%' }} />
            </colgroup>
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">
                <th className="pb-3 pl-1 text-left">Nazwa</th>
                <th className="pb-3 text-right">Ilość</th>
                <th className="pb-3 pl-2 text-left">J.m.</th>
                <th className="pb-3 text-right">Cena netto</th>
                <th className="pb-3 pl-2 text-left">Stawka VAT</th>
                <th className="pb-3 text-right">Wartość netto</th>
                <th className="pb-3 text-right">Wartość brutto</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const { net, gross } = calcLine(line);
                return (
                  <tr key={index} className="align-middle">
                    <td className="py-1 pr-1">
                      {serviceTemplates.length > 0 ? (
                        <Select
                          aria-label={t.newInvoice.catalogPickerButton}
                          value=""
                          onChange={(e) => { if (e.target.value) applyTemplate(e.target.value, index); }}
                          className="mb-1 text-xs"
                        >
                          <option value="">{t.newInvoice.catalogPickerDefault}</option>
                          {serviceTemplates.map((tmpl) => (
                            <option key={tmpl.id} value={tmpl.id}>{tmpl.name}</option>
                          ))}
                        </Select>
                      ) : null}
                      <Input
                        type="text"
                        aria-label="Nazwa pozycji"
                        value={line.name}
                        onChange={(e) => updateLine(index, 'name', e.target.value)}
                        placeholder="Nazwa usługi lub towaru"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        type="number"
                        aria-label="Ilość"
                        value={line.quantity}
                        min="0"
                        step="any"
                        onChange={(e) => updateLine(index, 'quantity', e.target.value)}
                        className="text-right tabular-nums"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        type="text"
                        aria-label="Jednostka miary"
                        value={line.unit}
                        onChange={(e) => updateLine(index, 'unit', e.target.value)}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        type="number"
                        aria-label="Cena netto"
                        value={line.unitNetPrice}
                        min="0"
                        step="0.01"
                        onChange={(e) => updateLine(index, 'unitNetPrice', e.target.value)}
                        placeholder="0,00"
                        className="text-right tabular-nums"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Select
                        aria-label="Stawka VAT"
                        value={line.vatRate}
                        onChange={(e) => updateLine(index, 'vatRate', e.target.value)}
                      >
                        {VAT_RATES.map((rate) => (
                          <option key={rate} value={rate}>
                            {VAT_RATE_LABELS[rate]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-1 py-1">
                      <div className="flex h-11 w-full items-center justify-end rounded-[1rem] border border-outline/40 bg-surface-raised/30 px-3 tabular-nums text-muted">
                        {formatPLN(net)}
                      </div>
                    </td>
                    <td className="px-1 py-1">
                      <div className="flex h-11 w-full items-center justify-end rounded-[1rem] border border-outline/40 bg-surface-raised/30 px-3 font-semibold tabular-nums text-foreground">
                        {formatPLN(gross)}
                      </div>
                    </td>
                    <td className="py-1 pl-1">
                      <div className="flex h-11 items-center justify-center">
                        {lines.length > 1 ? (
                          <button
                            type="button"
                            aria-label="Usuń pozycję"
                            onClick={() => removeLine(index)}
                            className="rounded-lg p-1.5 text-muted transition hover:bg-error-soft hover:text-error-ink"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button
            type="button"
            onClick={addLine}
            className="mt-3 text-sm font-semibold text-primary transition hover:text-primary/80"
          >
            + Dodaj pozycję
          </button>
        </div>

        {/* Mobile cards */}
        <div className="grid gap-4 lg:hidden">
          {lines.map((line, index) => {
            const { net, vat, gross } = calcLine(line);
            return (
              <Surface key={index} tone="glass" shape="organic" className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                    Pozycja {index + 1}
                  </p>
                  {lines.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-error-ink hover:bg-error-soft"
                      onClick={() => removeLine(index)}
                    >
                      Usuń
                    </Button>
                  ) : null}
                </div>

                <div className="grid gap-4">
                  {serviceTemplates.length > 0 ? (
                    <FormField label={t.newInvoice.catalogPickerButton}>
                      <Select
                        value=""
                        onChange={(e) => { if (e.target.value) applyTemplate(e.target.value, index); }}
                      >
                        <option value="">{t.newInvoice.catalogPickerDefault}</option>
                        {serviceTemplates.map((tmpl) => (
                          <option key={tmpl.id} value={tmpl.id}>{tmpl.name}</option>
                        ))}
                      </Select>
                    </FormField>
                  ) : null}
                  <FormField label="Nazwa / opis" required>
                    <Input
                      type="text"
                      aria-label="Nazwa pozycji"
                      value={line.name}
                      onChange={(e) => updateLine(index, 'name', e.target.value)}
                      placeholder="Nazwa usługi lub towaru"
                    />
                  </FormField>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Jednostka miary">
                      <Input
                        type="text"
                        aria-label="Jednostka miary"
                        value={line.unit}
                        onChange={(e) => updateLine(index, 'unit', e.target.value)}
                      />
                    </FormField>
                    <FormField label="Ilość">
                      <Input
                        type="number"
                        aria-label="Ilość"
                        value={line.quantity}
                        min="0"
                        step="any"
                        onChange={(e) => updateLine(index, 'quantity', e.target.value)}
                        className="text-right tabular-nums"
                      />
                    </FormField>
                    <FormField label="Cena netto" required>
                      <Input
                        type="number"
                        aria-label="Cena netto"
                        value={line.unitNetPrice}
                        min="0"
                        step="0.01"
                        onChange={(e) => updateLine(index, 'unitNetPrice', e.target.value)}
                        placeholder="0,00"
                        className="text-right tabular-nums"
                      />
                    </FormField>
                    <FormField label="Stawka VAT">
                      <Select
                        aria-label="Stawka VAT"
                        value={line.vatRate}
                        onChange={(e) => updateLine(index, 'vatRate', e.target.value)}
                      >
                        {VAT_RATES.map((rate) => (
                          <option key={rate} value={rate}>
                            {VAT_RATE_LABELS[rate]}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  </div>

                  <div className="grid gap-3 rounded-[1.75rem_1.25rem_2rem_1.25rem] bg-surface-raised/50 p-4 backdrop-blur-xl sm:grid-cols-3">
                    <MobileTotalItem label="Netto" value={formatPLN(net)} />
                    <MobileTotalItem label="VAT" value={formatPLN(vat)} />
                    <MobileTotalItem label="Brutto" value={formatPLN(gross)} bold />
                  </div>
                </div>
              </Surface>
            );
          })}
          <button
            type="button"
            onClick={addLine}
            className="text-sm font-semibold text-primary transition hover:text-primary/80"
          >
            + Dodaj pozycję
          </button>
        </div>
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

function MobileTotalItem({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="text-right">
      <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{label}</div>
      <div className={bold ? 'mt-1 text-lg font-semibold tabular-nums text-foreground' : 'mt-1 text-sm font-medium tabular-nums text-foreground'}>
        {value}
      </div>
    </div>
  );
}

'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';
import type { ContractorServiceRate, ServiceTemplate, VatRate } from '../../lib/api-types';
import { formatMoney } from '../../lib/format';
import { t } from '../../lib/translations';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { Select } from '../atoms/Select';
import { Surface } from '../atoms/Surface';
import { FormField } from '../molecules/FormField';

export interface LineItem {
  name: string;
  quantity: string;
  unit: string;
  unitNetPrice: string;
  vatRate: VatRate;
}

export const VAT_RATES: VatRate[] = ['23', '8', '5', '0', 'zw', 'np', 'oo'];

export const VAT_RATE_LABELS: Record<VatRate, string> = {
  '23': '23%',
  '8': '8%',
  '5': '5%',
  '0': '0%',
  zw: 'zw.',
  np: 'np.',
  oo: 'oo.',
};

export function emptyLine(): LineItem {
  return { name: '', quantity: '1', unit: 'szt.', unitNetPrice: '', vatRate: '23' };
}

export function vatMultiplier(rate: VatRate): number {
  if (rate === 'zw' || rate === 'np' || rate === 'oo') return 0;
  return parseInt(rate, 10) / 100;
}

export function calcLine(line: LineItem): { net: number; vat: number; gross: number } {
  const qty = parseFloat(line.quantity) || 0;
  const price = parseFloat(line.unitNetPrice) || 0;
  const net = Math.round(qty * price * 100) / 100;
  const vat = Math.round(net * vatMultiplier(line.vatRate) * 100) / 100;
  return { net, vat, gross: Math.round((net + vat) * 100) / 100 };
}

interface InvoiceLineItemsEditorProps {
  lines: LineItem[];
  onLinesChange: Dispatch<SetStateAction<LineItem[]>>;
  serviceTemplates?: ServiceTemplate[];
  contractorRates?: ContractorServiceRate[];
  contractorId: string;
  allowsNegativeUnitNetPrice?: boolean;
}

export function InvoiceLineItemsEditor({
  lines,
  onLinesChange,
  serviceTemplates = [],
  contractorRates = [],
  contractorId,
  allowsNegativeUnitNetPrice = false,
}: InvoiceLineItemsEditorProps) {
  const updateLine = useCallback(
    (index: number, field: keyof LineItem, value: string) => {
      onLinesChange((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
    },
    [onLinesChange],
  );

  const addLine = useCallback(() => onLinesChange((prev) => [...prev, emptyLine()]), [onLinesChange]);

  const removeLine = useCallback(
    (index: number) => onLinesChange((prev) => prev.filter((_, i) => i !== index)),
    [onLinesChange],
  );

  const applyTemplate = useCallback(
    (templateId: string, lineIndex: number) => {
      const template = serviceTemplates.find((tmpl) => tmpl.id === templateId);
      if (!template) return;

      const rate = contractorRates.find(
        (r) => r.serviceTemplateId === templateId && r.contractorId === contractorId,
      );

      onLinesChange((prev) =>
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
    [serviceTemplates, contractorRates, contractorId, onLinesChange],
  );

  return (
    <>
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
                      min={allowsNegativeUnitNetPrice ? undefined : '0'}
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
                    <div className="flex h-11 w-full items-center justify-end rounded-[1rem] border border-outline bg-surface-raised/30 px-3 tabular-nums text-muted">
                      {formatMoney(net)}
                    </div>
                  </td>
                  <td className="px-1 py-1">
                    <div className="flex h-11 w-full items-center justify-end rounded-[1rem] border border-outline bg-surface-raised/30 px-3 font-semibold tabular-nums text-foreground">
                      {formatMoney(gross)}
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
                      min={allowsNegativeUnitNetPrice ? undefined : '0'}
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
                  <MobileTotalItem label="Netto" value={formatMoney(net)} />
                  <MobileTotalItem label="VAT" value={formatMoney(vat)} />
                  <MobileTotalItem label="Brutto" value={formatMoney(gross)} bold />
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
    </>
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

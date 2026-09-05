'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';
import type { ContractorServiceRate, ServiceTemplate, VatRate } from '../../lib/api-types';
import { formatMoney, parseDecimalValue } from '../../lib/format';
import { t } from '../../lib/translations';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { Select } from '../atoms/Select';
import { Surface } from '../atoms/Surface';
import { CatalogueItemPicker } from '../molecules/CatalogueItemPicker';
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
  const qty = parseDecimalValue(line.quantity) ?? 0;
  const price = parseDecimalValue(line.unitNetPrice) ?? 0;
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
}

export function InvoiceLineItemsEditor({
  lines,
  onLinesChange,
  serviceTemplates = [],
  contractorRates = [],
  contractorId,
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
      <div className="hidden xl:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: '24%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '7%' }} />
          </colgroup>
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">
              <th className="pb-3 pl-1 text-left">{t.invoiceLineItemsEditor.nameColumn}</th>
              <th className="pb-3 text-right">{t.invoiceLineItemsEditor.quantityColumn}</th>
              <th className="pb-3 pl-2 text-left">{t.invoiceLineItemsEditor.unitColumn}</th>
              <th className="pb-3 text-right">{t.invoiceLineItemsEditor.unitNetPriceColumn}</th>
              <th className="pb-3 pl-2 text-left">{t.invoiceLineItemsEditor.vatRateColumn}</th>
              <th className="pb-3 text-right">{t.invoiceLineItemsEditor.grossValueColumn}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const { gross } = calcLine(line);
              return (
                <tr key={index} className="align-middle">
                  <td className="py-1 pr-1">
                    <CatalogueItemPicker
                      serviceTemplates={serviceTemplates}
                      contractorRates={contractorRates}
                      contractorId={contractorId}
                      value={line.name}
                      onNameChange={(name) => updateLine(index, 'name', name)}
                      onTemplateSelect={(templateId) => applyTemplate(templateId, index)}
                      ariaLabel={t.invoiceLineItemsEditor.itemNameAriaLabel}
                      placeholder={t.invoiceLineItemsEditor.itemNamePlaceholder}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      type="text"
                      inputMode="decimal"
                      aria-label={t.invoiceLineItemsEditor.quantityAriaLabel}
                      value={line.quantity}
                      onChange={(e) => updateLine(index, 'quantity', e.target.value)}
                      className="text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      type="text"
                      aria-label={t.invoiceLineItemsEditor.unitAriaLabel}
                      value={line.unit}
                      onChange={(e) => updateLine(index, 'unit', e.target.value)}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      type="text"
                      inputMode="decimal"
                      aria-label={t.invoiceLineItemsEditor.unitNetPriceAriaLabel}
                      value={line.unitNetPrice}
                      onChange={(e) => updateLine(index, 'unitNetPrice', e.target.value)}
                      placeholder="0,00"
                      className="text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Select
                      aria-label={t.invoiceLineItemsEditor.vatRateAriaLabel}
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
                    <div className="flex h-11 w-full items-center justify-end rounded-control border border-outline bg-surface-raised px-3 font-semibold tabular-nums text-foreground">
                      {formatMoney(gross)}
                    </div>
                  </td>
                  <td className="py-1 pl-1">
                    <div className="flex h-11 items-center justify-center">
                      {lines.length > 1 ? (
                        <button
                          type="button"
                          aria-label={t.invoiceLineItemsEditor.removeLineAriaLabel}
                          onClick={() => removeLine(index)}
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-control p-3 text-muted transition hover:bg-error hover:text-error-ink"
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
        <Button type="button" variant="secondary" size="sm" onClick={addLine} className="mt-3">
          {t.invoiceLineItemsEditor.addLineButton}
        </Button>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-4 xl:hidden">
        {lines.map((line, index) => {
          const { net, vat, gross } = calcLine(line);
          return (
            <Surface key={index} tone="inset" className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                  {t.invoiceLineItemsEditor.positionLabel(index + 1)}
                </p>
                {lines.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-error-ink hover:bg-error"
                    onClick={() => removeLine(index)}
                  >
                    {t.invoiceLineItemsEditor.removeButton}
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-4">
                <FormField label={t.invoiceLineItemsEditor.nameFieldLabel} required>
                  <CatalogueItemPicker
                    serviceTemplates={serviceTemplates}
                    contractorRates={contractorRates}
                    contractorId={contractorId}
                    value={line.name}
                    onNameChange={(name) => updateLine(index, 'name', name)}
                    onTemplateSelect={(templateId) => applyTemplate(templateId, index)}
                    ariaLabel={t.invoiceLineItemsEditor.itemNameAriaLabel}
                    placeholder={t.invoiceLineItemsEditor.itemNamePlaceholder}
                  />
                </FormField>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label={t.invoiceLineItemsEditor.unitFieldLabel}>
                    <Input
                      type="text"
                      aria-label={t.invoiceLineItemsEditor.unitAriaLabel}
                      value={line.unit}
                      onChange={(e) => updateLine(index, 'unit', e.target.value)}
                    />
                  </FormField>
                  <FormField label={t.invoiceLineItemsEditor.quantityFieldLabel}>
                    <Input
                      type="text"
                      inputMode="decimal"
                      aria-label={t.invoiceLineItemsEditor.quantityAriaLabel}
                      value={line.quantity}
                      onChange={(e) => updateLine(index, 'quantity', e.target.value)}
                      className="text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </FormField>
                  <FormField label={t.invoiceLineItemsEditor.unitNetPriceFieldLabel} required>
                    <Input
                      type="text"
                      inputMode="decimal"
                      aria-label={t.invoiceLineItemsEditor.unitNetPriceAriaLabel}
                      value={line.unitNetPrice}
                      onChange={(e) => updateLine(index, 'unitNetPrice', e.target.value)}
                      placeholder="0,00"
                      className="text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </FormField>
                  <FormField label={t.invoiceLineItemsEditor.vatRateFieldLabel}>
                    <Select
                      aria-label={t.invoiceLineItemsEditor.vatRateAriaLabel}
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

                <div className="grid gap-3 rounded-card bg-surface-raised p-4 sm:grid-cols-3">
                  <MobileTotalItem label={t.invoiceDetail.metrics.net} value={formatMoney(net)} />
                  <MobileTotalItem label={t.invoiceDetail.metrics.vat} value={formatMoney(vat)} />
                  <MobileTotalItem label={t.invoiceDetail.metrics.gross} value={formatMoney(gross)} bold />
                </div>
              </div>
            </Surface>
          );
        })}
        <Button type="button" variant="secondary" size="sm" onClick={addLine}>
          {t.invoiceLineItemsEditor.addLineButton}
        </Button>
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

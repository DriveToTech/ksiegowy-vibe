'use client';

import { Fragment, useEffect, useId, useRef, type Dispatch, type SetStateAction } from 'react';
import type { ContractorServiceRate, ServiceTemplate, VatRate } from '../../lib/api-types';
import { formatMoney } from '../../lib/format';
import {
  calcLine,
  calcLineTotals,
  emptyLine,
  VAT_RATE_LABELS,
  VAT_RATES,
  type LineItem,
} from '../../lib/invoice-line-calculation';
import { t } from '../../lib/translations';
import { Input } from '../atoms/Input';
import { Select } from '../atoms/Select';
import { Surface } from '../atoms/Surface';
import { CatalogueItemPicker } from '../molecules/CatalogueItemPicker';

interface InvoiceLineItemsEditorProps {
  lines: LineItem[];
  onLinesChange: Dispatch<SetStateAction<LineItem[]>>;
  serviceTemplates?: ServiceTemplate[];
  contractorRates?: ContractorServiceRate[];
  contractorId: string;
}

// The table layout starts at a 640px wide card (container query), cards below it.
// Fields keep the atom defaults (48px, 16px font) in the card layout and become 44px / 13px in the table.
const tableField = '@[760px]:h-11 @[760px]:text-[13px]';
const numericField = `${tableField} text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;
const headerAction =
  '-my-3 min-h-11 items-center rounded-control px-2 text-[12.5px] font-medium text-primary transition hover:bg-secondary-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const eyebrow = 'font-mono text-[10px] uppercase tracking-[0.13em] text-muted';

export function InvoiceLineItemsEditor({
  lines,
  onLinesChange,
  serviceTemplates = [],
  contractorRates = [],
  contractorId,
}: InvoiceLineItemsEditorProps) {
  const headingId = useId();
  // Focus is moved after the render that adds or removes the row: a row index, or 'add' for the add button.
  const pendingFocus = useRef<number | 'add' | null>(null);
  const totals = calcLineTotals(lines);
  const hasCatalogue = serviceTemplates.length > 0;

  useEffect(() => {
    if (pendingFocus.current === null) return;
    const candidates =
      pendingFocus.current === 'add'
        ? ['invoice-add-line-header', 'invoice-add-line-footer']
        : [`invoice-line-${pendingFocus.current}-desktop-name`, `invoice-line-${pendingFocus.current}-mobile-name`];
    pendingFocus.current = null;
    // Both layouts are mounted, only one is displayed: focus the one that has a layout box.
    candidates
      .map((candidate) => document.getElementById(candidate))
      .find((element) => element !== null && element.offsetParent !== null)
      ?.focus();
  }, [lines]);

  const updateLine = (index: number, field: keyof LineItem, value: string) =>
    onLinesChange((previous) => previous.map((line, lineIndex) => (lineIndex === index ? { ...line, [field]: value } : line)));

  const addLine = () => {
    pendingFocus.current = lines.length;
    onLinesChange((previous) => [...previous, emptyLine()]);
  };

  const removeLine = (index: number) => {
    pendingFocus.current = index > 0 ? index - 1 : 'add';
    onLinesChange((previous) => previous.filter((_, lineIndex) => lineIndex !== index));
  };

  const applyTemplate = (templateId: string, lineIndex: number) => {
    const template = serviceTemplates.find((candidate) => candidate.id === templateId);
    if (!template) return;

    const rate = contractorRates.find(
      (candidate) => candidate.serviceTemplateId === templateId && candidate.contractorId === contractorId,
    );

    onLinesChange((previous) =>
      previous.map((line, index) =>
        index === lineIndex
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
  };

  const labelFor = (label: string, position: number) => t.invoiceLineItemsEditor.fieldAriaLabel(label, position);

  return (
    <Surface tone="panel" className="@container">
      <div className="flex items-center justify-between gap-3 border-b border-outline px-[18px] py-[13px]">
        <h2 id={headingId} className="min-w-0 truncate text-sm font-semibold text-foreground">{t.invoiceDetail.sections.lineItemsTitle}</h2>
        <div className="flex shrink-0 items-center gap-1 whitespace-nowrap @[760px]:gap-3.5">
          {hasCatalogue ? (
            <button type="button" onClick={addLine} className={`${headerAction} inline-flex`}>
              {t.invoiceLineItemsEditor.fromCatalogueButton}
            </button>
          ) : null}
          <button type="button" id="invoice-add-line-header" onClick={addLine} className={`${headerAction} hidden @[760px]:inline-flex`}>
            {t.invoiceLineItemsEditor.addLineButton}
          </button>
        </div>
      </div>

      {/* Table layout */}
      <div className="hidden @[760px]:block">
        <table className="w-full table-fixed border-collapse text-[13px]" aria-labelledby={headingId}>
          <colgroup>
            <col className="w-[50px]" />
            <col />
            <col className="w-[74px]" />
            <col className="w-[74px]" />
            <col className="w-[116px]" />
            <col className="w-[74px]" />
            <col className="w-[114px]" />
            <col className="w-[66px]" />
          </colgroup>
          <thead className={`bg-surface-muted ${eyebrow} tracking-[0.12em]`}>
            <tr>
              <th scope="col" className="py-2.5 pl-[18px] pr-1 text-left font-normal">{t.invoiceLineItemsEditor.numberColumn}</th>
              <th scope="col" className="px-1 py-2.5 text-left font-normal">{t.invoiceLineItemsEditor.nameColumn}</th>
              <th scope="col" className="px-1 py-2.5 text-left font-normal">{t.invoiceLineItemsEditor.unitColumn}</th>
              <th scope="col" className="px-1 py-2.5 text-right font-normal">{t.invoiceLineItemsEditor.quantityColumn}</th>
              <th scope="col" className="px-1 py-2.5 text-right font-normal">{t.invoiceLineItemsEditor.unitNetPriceColumn}</th>
              <th scope="col" className="px-1 py-2.5 text-right font-normal">{t.invoiceLineItemsEditor.vatRateColumn}</th>
              <th scope="col" className="px-1 py-2.5 text-right font-normal">{t.invoiceLineItemsEditor.grossValueColumn}</th>
              <th scope="col" className="py-2.5 pl-1 pr-[18px]"><span className="sr-only">{t.invoiceLineItemsEditor.removeButton}</span></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const position = index + 1;
              const { gross } = calcLine(line);
              return (
                <Fragment key={index}>
                  <tr className="border-t border-outline">
                    <td className="py-2.5 pl-[18px] pr-1 tabular-nums text-muted">{position}</td>
                    <td className="px-1 py-2.5">
                      <CatalogueItemPicker
                        id={`invoice-line-${index}-desktop-name`}
                        panelHostId={`invoice-line-${index}-catalogue-panel`}
                        serviceTemplates={serviceTemplates}
                        contractorRates={contractorRates}
                        contractorId={contractorId}
                        value={line.name}
                        onNameChange={(name) => updateLine(index, 'name', name)}
                        onTemplateSelect={(templateId) => applyTemplate(templateId, index)}
                        ariaLabel={labelFor(t.invoiceLineItemsEditor.itemNameAriaLabel, position)}
                        placeholder={t.invoiceLineItemsEditor.itemNamePlaceholder}
                        className={`${tableField} @[760px]:px-[11px]`}
                      />
                    </td>
                    <td className="px-1 py-2.5">
                      <Input
                        id={`invoice-line-${index}-desktop-unit`}
                        type="text"
                        aria-label={labelFor(t.invoiceLineItemsEditor.unitAriaLabel, position)}
                        value={line.unit}
                        onChange={(event) => updateLine(index, 'unit', event.target.value)}
                        className={`${tableField} @[760px]:px-2 @[760px]:text-[12.5px]`}
                      />
                    </td>
                    <td className="px-1 py-2.5">
                      <Input
                        id={`invoice-line-${index}-desktop-quantity`}
                        type="text"
                        inputMode="decimal"
                        aria-label={labelFor(t.invoiceLineItemsEditor.quantityAriaLabel, position)}
                        value={line.quantity}
                        onChange={(event) => updateLine(index, 'quantity', event.target.value)}
                        className={`${numericField} @[760px]:px-2`}
                      />
                    </td>
                    <td className="px-1 py-2.5">
                      <Input
                        id={`invoice-line-${index}-desktop-unit-net-price`}
                        type="text"
                        inputMode="decimal"
                        aria-label={labelFor(t.invoiceLineItemsEditor.unitNetPriceAriaLabel, position)}
                        value={line.unitNetPrice}
                        onChange={(event) => updateLine(index, 'unitNetPrice', event.target.value)}
                        placeholder="0,00"
                        className={`${numericField} @[760px]:px-2.5`}
                      />
                    </td>
                    <td className="px-1 py-2.5">
                      <Select
                        id={`invoice-line-${index}-desktop-vat-rate`}
                        aria-label={labelFor(t.invoiceLineItemsEditor.vatRateAriaLabel, position)}
                        value={line.vatRate}
                        onChange={(event) => updateLine(index, 'vatRate', event.target.value)}
                        className={`${tableField} appearance-none text-right [text-align-last:right] @[760px]:px-2 @[760px]:font-normal`}
                      >
                        {VAT_RATES.map((rate) => (
                          <option key={rate} value={rate}>
                            {VAT_RATE_LABELS[rate]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className={`px-1 py-2.5 text-right font-semibold tabular-nums ${gross === 0 ? 'text-muted' : 'text-foreground'}`}>
                      {gross === 0 ? '0,00' : formatMoney(gross)}
                    </td>
                    <td className="py-2.5 pl-1 pr-[18px]">
                      {lines.length > 1 ? (
                        <button
                          type="button"
                          aria-label={t.invoiceLineItemsEditor.removeLineAriaLabel(position)}
                          onClick={() => removeLine(index)}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-control text-muted transition hover:bg-error hover:text-error-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {hasCatalogue ? (
                    <tr>
                      <td colSpan={8} className="p-0">
                        <div id={`invoice-line-${index}-catalogue-panel`} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Card layout */}
      <div className="grid gap-3 p-3 @[760px]:hidden">
        {lines.map((line, index) => {
          const position = index + 1;
          const { net, vat, gross } = calcLine(line);
          return (
            <div key={index} className="space-y-3 rounded-inset border border-outline bg-surface-raised p-[13px]">
              <div className="flex items-center justify-between gap-3">
                <p className={eyebrow}>{t.invoiceLineItemsEditor.positionLabel(position)}</p>
                {lines.length > 1 ? (
                  <button
                    type="button"
                    aria-label={t.invoiceLineItemsEditor.removeLineAriaLabel(position)}
                    onClick={() => removeLine(index)}
                    className="-my-2 inline-flex min-h-11 items-center rounded-control px-2 text-[13px] font-medium text-error-ink transition hover:bg-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error-ink"
                  >
                    {t.invoiceLineItemsEditor.removeButton}
                  </button>
                ) : null}
              </div>

              <div className="flex flex-col gap-[5px]">
                <label htmlFor={`invoice-line-${index}-mobile-name`} className="text-xs text-muted">{t.invoiceLineItemsEditor.nameFieldLabel}</label>
                <CatalogueItemPicker
                  id={`invoice-line-${index}-mobile-name`}
                  serviceTemplates={serviceTemplates}
                  contractorRates={contractorRates}
                  contractorId={contractorId}
                  value={line.name}
                  onNameChange={(name) => updateLine(index, 'name', name)}
                  onTemplateSelect={(templateId) => applyTemplate(templateId, index)}
                  ariaLabel={labelFor(t.invoiceLineItemsEditor.itemNameAriaLabel, position)}
                  placeholder={t.invoiceLineItemsEditor.itemNamePlaceholder}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-[5px]">
                  <label htmlFor={`invoice-line-${index}-mobile-unit`} className="text-xs text-muted">{t.invoiceLineItemsEditor.unitFieldLabel}</label>
                  <Input
                    id={`invoice-line-${index}-mobile-unit`}
                    type="text"
                    aria-label={labelFor(t.invoiceLineItemsEditor.unitAriaLabel, position)}
                    value={line.unit}
                    onChange={(event) => updateLine(index, 'unit', event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-[5px]">
                  <label htmlFor={`invoice-line-${index}-mobile-quantity`} className="text-xs text-muted">{t.invoiceLineItemsEditor.quantityFieldLabel}</label>
                  <Input
                    id={`invoice-line-${index}-mobile-quantity`}
                    type="text"
                    inputMode="decimal"
                    aria-label={labelFor(t.invoiceLineItemsEditor.quantityAriaLabel, position)}
                    value={line.quantity}
                    onChange={(event) => updateLine(index, 'quantity', event.target.value)}
                    className="text-right tabular-nums"
                  />
                </div>
                <div className="flex flex-col gap-[5px]">
                  <label htmlFor={`invoice-line-${index}-mobile-unit-net-price`} className="text-xs text-muted">{t.invoiceLineItemsEditor.unitNetPriceFieldLabel}</label>
                  <Input
                    id={`invoice-line-${index}-mobile-unit-net-price`}
                    type="text"
                    inputMode="decimal"
                    aria-label={labelFor(t.invoiceLineItemsEditor.unitNetPriceAriaLabel, position)}
                    value={line.unitNetPrice}
                    onChange={(event) => updateLine(index, 'unitNetPrice', event.target.value)}
                    placeholder="0,00"
                    className="text-right tabular-nums"
                  />
                </div>
                <div className="flex flex-col gap-[5px]">
                  <label htmlFor={`invoice-line-${index}-mobile-vat-rate`} className="text-xs text-muted">{t.invoiceLineItemsEditor.vatRateFieldLabel}</label>
                  <Select
                    id={`invoice-line-${index}-mobile-vat-rate`}
                    aria-label={labelFor(t.invoiceLineItemsEditor.vatRateAriaLabel, position)}
                    value={line.vatRate}
                    onChange={(event) => updateLine(index, 'vatRate', event.target.value)}
                  >
                    {VAT_RATES.map((rate) => (
                      <option key={rate} value={rate}>
                        {VAT_RATE_LABELS[rate]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <dl className="grid grid-cols-3 gap-2 border-t border-outline pt-3 text-right text-[12.5px]">
                <div>
                  <dt className={eyebrow}>{t.invoiceDetail.metrics.net}</dt>
                  <dd className="tabular-nums text-foreground-secondary">{formatMoney(net)}</dd>
                </div>
                <div>
                  <dt className={eyebrow}>{t.invoiceDetail.metrics.vat}</dt>
                  <dd className="tabular-nums text-foreground-secondary">{formatMoney(vat)}</dd>
                </div>
                <div>
                  <dt className={eyebrow}>{t.invoiceDetail.metrics.gross}</dt>
                  <dd className="font-semibold tabular-nums text-foreground">{formatMoney(gross)}</dd>
                </div>
              </dl>
            </div>
          );
        })}
        <button
          type="button"
          id="invoice-add-line-footer"
          onClick={addLine}
          className="min-h-12 w-full rounded-control border border-outline bg-secondary-surface text-sm font-semibold text-secondary-ink transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {t.invoiceLineItemsEditor.addLineButton}
        </button>
      </div>

      <dl className="flex flex-wrap justify-end gap-x-4 gap-y-2 rounded-b-card border-t border-outline bg-surface-muted px-[18px] py-3.5 @[760px]:gap-x-9">
        <div className="text-right">
          <dt className={eyebrow}>{t.invoiceDetail.metrics.net}</dt>
          <dd className="text-base font-medium tabular-nums text-foreground">{formatMoney(totals.net)}</dd>
        </div>
        <div className="text-right">
          <dt className={eyebrow}>{t.invoiceDetail.metrics.vat}</dt>
          <dd className="text-base font-medium tabular-nums text-foreground">{formatMoney(totals.vat)}</dd>
        </div>
        <div className="text-right">
          <dt className={eyebrow}>{t.invoiceDetail.metrics.gross}</dt>
          <dd className="text-base font-semibold tabular-nums text-foreground">{formatMoney(totals.gross)}</dd>
        </div>
      </dl>
    </Surface>
  );
}

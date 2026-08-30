'use client';

import Link from 'next/link';
import { useId, useState, type KeyboardEvent } from 'react';
import type { ContractorServiceRate, ServiceTemplate } from '../../lib/api-types';
import { cn } from '../../lib/cn';
import { formatMoney } from '../../lib/format';
import { t } from '../../lib/translations';
import { Input } from '../atoms/Input';

interface CatalogueItemPickerProps {
  serviceTemplates: ServiceTemplate[];
  contractorRates: ContractorServiceRate[];
  contractorId: string;
  value: string;
  onNameChange: (name: string) => void;
  onTemplateSelect: (serviceTemplateId: string) => void;
  ariaLabel: string;
  placeholder: string;
  className?: string;
}

const MAX_MATCHES = 8;

function formatVatRate(vatRate: string): string {
  return vatRate === 'zw' || vatRate === 'np' || vatRate === 'oo' ? `${vatRate}.` : `${vatRate}%`;
}

export function CatalogueItemPicker({
  serviceTemplates,
  contractorRates,
  contractorId,
  value,
  onNameChange,
  onTemplateSelect,
  ariaLabel,
  placeholder,
  className,
}: CatalogueItemPickerProps) {
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // ponytail: two simplifications vs the mock, both deliberate:
  // 1. one input, not two — this trigger input IS the search box (the mock draws a
  //    separate search field inside the popover on top of a static trigger row).
  // 2. popover is `position: absolute`, not woven into the table flow like the mock —
  //    avoids reflowing the rows below on every keystroke.
  if (serviceTemplates.length === 0) {
    return (
      <Input type="text" aria-label={ariaLabel} value={value} onChange={(event) => onNameChange(event.target.value)} placeholder={placeholder} className={className} />
    );
  }

  const query = value.trim().toLowerCase();
  const matches = serviceTemplates
    .filter((template) => !query || template.name.toLowerCase().includes(query) || template.unit.toLowerCase().includes(query))
    .slice(0, MAX_MATCHES);

  const rateForTemplate = (templateId: string) =>
    contractorRates.find((rate) => rate.serviceTemplateId === templateId && rate.contractorId === contractorId);

  const selectTemplate = (template: ServiceTemplate) => {
    onTemplateSelect(template.id);
    setIsOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const highlighted = matches[highlightedIndex];
      if (isOpen && highlighted) selectTemplate(highlighted);
      return;
    }
    if (event.key === 'Escape') {
      setIsOpen(false);
      return;
    }
    if (event.key === 'Tab') {
      setIsOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
        return;
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setHighlightedIndex((index) => (matches.length === 0 ? -1 : (index + delta + matches.length) % matches.length));
    }
  };

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsOpen(false);
      }}
    >
      <Input
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={isOpen && matches[highlightedIndex] ? `${listboxId}-${highlightedIndex}` : undefined}
        value={value}
        onChange={(event) => {
          onNameChange(event.target.value);
          setIsOpen(true);
          setHighlightedIndex(0);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
      />

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-inset border border-primary/35 bg-surface-muted">
          <div className="flex items-center justify-between gap-3 border-b border-outline px-[13px] py-[9px]">
            <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-muted">
              {t.newInvoice.catalogueHint(matches.length, serviceTemplates.length)}
            </span>
          </div>

          {matches.length === 0 ? (
            <p className="px-[13px] py-[10px] text-[12.5px] text-muted">{t.newInvoice.catalogueNoMatches}</p>
          ) : (
            <ul id={listboxId} role="listbox" aria-label={ariaLabel}>
              {matches.map((template, index) => {
                const rate = rateForTemplate(template.id);
                return (
                  <li
                    key={template.id}
                    id={`${listboxId}-${index}`}
                    role="option"
                    aria-selected={index === highlightedIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => selectTemplate(template)}
                    className={cn(
                      'grid cursor-pointer grid-cols-[minmax(0,1fr)_74px_92px_62px] items-center px-[13px] py-[10px] text-[12.5px]',
                      index > 0 && 'border-t border-outline',
                      index === highlightedIndex && 'bg-primary-soft',
                    )}
                  >
                    <div>
                      {template.name}
                      {template.description ? (
                        <div className="font-mono text-[10.5px] text-muted">{template.description}</div>
                      ) : null}
                    </div>
                    <div className="text-muted">{template.unit}</div>
                    <div className="text-right tabular-nums">{rate ? formatMoney(rate.unitNetPrice) : '—'}</div>
                    <div className="text-right text-muted">{formatVatRate(template.vatRate)}</div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex items-center justify-between border-t border-outline bg-surface-panel px-[13px] py-[9px]">
            <span className="text-[12px] text-muted">{t.newInvoice.catalogueNothingFits}</span>
            <Link href="/dashboard/settings/service-catalog" className="text-[12px] font-medium text-primary">
              {t.newInvoice.catalogueSaveToCatalogue}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

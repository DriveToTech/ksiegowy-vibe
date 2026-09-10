'use client';

import { useMemo, useState } from 'react';
import type { ServiceTemplate, VatRate } from '../../../../lib/api-client';
import {
  createServiceTemplate,
  updateServiceTemplate,
  deleteServiceTemplate,
} from '../../../../lib/api-client';
import { Badge } from '../../../../components/atoms/Badge';
import { Button } from '../../../../components/atoms/Button';
import { Input } from '../../../../components/atoms/Input';
import { Select } from '../../../../components/atoms/Select';
import { NativeDialog } from '../../../../components/atoms/NativeDialog';
import { Banner } from '../../../../components/molecules/Banner';
import { FormField } from '../../../../components/molecules/FormField';
import { cn } from '../../../../lib/cn';
import { t } from '../../../../lib/translations';

const VAT_RATES: VatRate[] = ['23', '8', '5', '0', 'zw', 'np', 'oo'];
const VAT_RATE_LABELS: Record<VatRate, string> = {
  '23': '23%', '8': '8%', '5': '5%', '0': '0%', zw: 'zw.', np: 'np.', oo: 'oo.',
};

type StatusFilter = 'active' | 'archived' | 'all';
type MobileView = 'list' | 'detail' | 'create';

interface FormState {
  name: string;
  unit: string;
  vatRate: VatRate;
  description: string;
}

function emptyForm(): FormState {
  return { name: '', unit: 'szt.', vatRate: '23', description: '' };
}

function formFromTemplate(template: ServiceTemplate): FormState {
  return {
    name: template.name,
    unit: template.unit,
    vatRate: template.vatRate as VatRate,
    description: template.description ?? '',
  };
}

export function ServiceCatalogManager({
  companyId,
  initialTemplates,
}: {
  companyId: string;
  initialTemplates: ServiceTemplate[];
}) {
  const [templates, setTemplates] = useState<ServiceTemplate[]>(initialTemplates);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialTemplates[0]?.id ?? null);
  const [mobileView, setMobileView] = useState<MobileView>('list');
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<FormState>(() => (
    initialTemplates[0] ? formFromTemplate(initialTemplates[0]) : emptyForm()
  ));
  const [formTemplateId, setFormTemplateId] = useState<string | null>(initialTemplates[0]?.id ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateToArchive, setTemplateToArchive] = useState<ServiceTemplate | null>(null);

  const filtered = useMemo(() => templates.filter((template) => {
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && template.isActive) ||
      (statusFilter === 'archived' && !template.isActive);
    const matchesSearch = search.trim() === '' || template.name.toLowerCase().includes(search.trim().toLowerCase());
    return matchesStatus && matchesSearch;
  }), [templates, statusFilter, search]);

  const effectiveSelectedId = filtered.some((template) => template.id === selectedId) ? selectedId : filtered[0]?.id ?? null;
  const selected = !isCreating ? templates.find((template) => template.id === effectiveSelectedId) ?? null : null;
  const hasRecords = templates.length > 0;
  const activeForm = !isCreating && selected && formTemplateId !== selected.id
    ? formFromTemplate(selected)
    : form;

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({
      ...(selected && formTemplateId !== selected.id ? formFromTemplate(selected) : prev),
      [field]: value,
    }));
    setFormTemplateId(selected?.id ?? null);
  };

  const selectRow = (id: string) => {
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setIsCreating(false);
    setSelectedId(id);
    setForm(formFromTemplate(template));
    setFormTemplateId(id);
    setError(null);
    setMobileView('detail');
  };

  const startCreate = () => {
    setIsCreating(true);
    setSelectedId(null);
    setForm(emptyForm());
    setFormTemplateId(null);
    setError(null);
    setMobileView('create');
  };

  const closeMobileView = () => {
    setMobileView('list');
    if (isCreating) {
      setIsCreating(false);
      setSelectedId(filtered[0]?.id ?? null);
    }
  };

  const handleSave = () => {
    if (!activeForm.name.trim()) { setError(t.serviceCatalog.errors.nameRequired); return; }
    setSubmitting(true);
    setError(null);

    const payload = {
      name: activeForm.name.trim(),
      unit: activeForm.unit.trim() || 'szt.',
      vatRate: activeForm.vatRate,
      description: activeForm.description.trim() || undefined,
    };

    const request = isCreating || !selected
      ? createServiceTemplate(companyId, payload)
      : updateServiceTemplate(companyId, selected.id, payload);

    request
      .then((saved) => {
        setTemplates((prev) => (isCreating || !selected
          ? [...prev, saved].sort((a, b) => a.name.localeCompare(b.name))
          : prev.map((template) => (template.id === saved.id ? saved : template))));
        setIsCreating(false);
        setSelectedId(saved.id);
        setForm(formFromTemplate(saved));
        setFormTemplateId(saved.id);
        setMobileView('detail');
      })
      .catch((err) => setError(err instanceof Error ? err.message : t.serviceCatalog.errors.saveFailed))
      .finally(() => setSubmitting(false));
  };

  const executeArchive = (templateId: string) => {
    setSubmitting(true);
    setError(null);
    deleteServiceTemplate(companyId, templateId)
      .then(() => setTemplates((prev) => prev.map((template) => (template.id === templateId ? { ...template, isActive: false } : template))))
      .catch((err) => setError(err instanceof Error ? err.message : t.serviceCatalog.errors.deleteFailed))
      .finally(() => setSubmitting(false));
  };

  const handleRestore = () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    updateServiceTemplate(companyId, selected.id, { isActive: true })
      .then((updated) => setTemplates((prev) => prev.map((template) => (template.id === selected.id ? updated : template))))
      .catch((err) => setError(err instanceof Error ? err.message : t.serviceCatalog.errors.updateFailed))
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_372px] lg:items-start">
      <div className={cn('space-y-4', mobileView !== 'list' && 'hidden lg:block')}>
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <p className="text-sm font-semibold text-foreground">{t.serviceCatalog.columns.name}</p>
          <Button type="button" variant="secondary" onClick={startCreate}>
            {t.serviceCatalog.addButton}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <label htmlFor="service-catalog-search" className="sr-only">{t.contractors.searchPlaceholder}</label>
            <Input
              id="service-catalog-search"
              type="search"
              placeholder={t.contractors.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1 rounded-control border border-outline bg-surface-panel p-1">
            {(['all', 'active', 'archived'] as StatusFilter[]).map((filter) => (
              <Button
                key={filter}
                type="button"
                variant={statusFilter === filter ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setStatusFilter(filter)}
                className="text-xs font-semibold"
              >
                {filter === 'all' ? t.contractors.filterAll : filter === 'active' ? t.contractors.filterActive : t.serviceCatalog.inactive}
              </Button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-card border border-outline bg-surface-panel p-6 text-center text-sm text-muted">
            <p>{hasRecords ? t.contractors.emptyFiltered : t.serviceCatalog.emptyState}</p>
            {hasRecords ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                }}
                className="mt-3 font-semibold"
              >
                {t.contractors.filterAll}
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-card border border-outline bg-surface-panel lg:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="bg-surface-muted text-left">
                    <HeaderCell>{t.serviceCatalog.columns.name}</HeaderCell>
                    <HeaderCell>{t.serviceCatalog.columns.unit}</HeaderCell>
                    <HeaderCell className="text-right">{t.serviceCatalog.columns.vatRate}</HeaderCell>
                    <HeaderCell className="text-right">{t.serviceCatalog.columns.status}</HeaderCell>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((template) => (
                    <tr
                      key={template.id}
                      className={cn(
                        'border-t border-outline transition hover:bg-surface-row-hover',
                        !isCreating && template.id === effectiveSelectedId && 'bg-surface-row-hover',
                      )}
                    >
                      <BodyCell className="p-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => selectRow(template.id)}
                          aria-pressed={template.id === effectiveSelectedId}
                          className={cn(
                            'w-full justify-start rounded-none px-4 text-left font-medium focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
                            template.isActive ? 'text-foreground' : 'text-muted line-through',
                          )}
                        >
                          {template.name}
                        </Button>
                      </BodyCell>
                      <BodyCell className="text-muted">{template.unit}</BodyCell>
                      <BodyCell className="text-right text-foreground-secondary">
                        {VAT_RATE_LABELS[template.vatRate as VatRate] ?? template.vatRate}
                      </BodyCell>
                      <BodyCell className="text-right">
                        <Badge tone={template.isActive ? 'success' : 'draft'}>
                          {template.isActive ? t.contractors.status.active : t.serviceCatalog.inactive}
                        </Badge>
                      </BodyCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>

            <div className="overflow-hidden rounded-card border border-outline bg-surface-panel lg:hidden">
              {filtered.map((template) => (
                <Button
                  key={template.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => selectRow(template.id)}
                  aria-pressed={template.id === effectiveSelectedId}
                  className="flex min-h-11 w-full items-center justify-between gap-3 border-t border-outline px-4 py-3 text-left transition first:border-t-0 hover:bg-surface-row-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                >
                  <span className="min-w-0">
                    <span className={cn(
                      'block truncate text-sm font-medium',
                      template.isActive ? 'text-foreground' : 'text-muted line-through',
                    )}>
                      {template.name}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted">
                      {template.unit} · {VAT_RATE_LABELS[template.vatRate as VatRate] ?? template.vatRate}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge tone={template.isActive ? 'success' : 'draft'}>
                      {template.isActive ? t.contractors.status.active : t.serviceCatalog.inactive}
                    </Badge>
                    <span aria-hidden="true" className="text-lg text-muted">→</span>
                  </span>
                </Button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className={cn(
        'rounded-card border border-outline bg-chrome p-[22px]',
        mobileView === 'list' ? 'hidden lg:block' : 'block',
      )}>
        <div className="mb-3.5 flex items-start justify-between gap-3">
          <div className="space-y-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={closeMobileView}
              className="justify-start px-0 text-sm font-normal text-muted hover:text-foreground lg:hidden"
            >
              ← {t.serviceCatalog.detail.close}
            </Button>
            <p className="text-[17px] font-semibold leading-tight text-foreground">
            {isCreating ? t.serviceCatalog.addButton : selected?.name ?? t.serviceCatalog.detail.eyebrow}
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={startCreate} disabled={isCreating}>
            {t.serviceCatalog.addButton}
          </Button>
        </div>

        {error ? <Banner tone="error" className="mb-3.5">{error}</Banner> : null}

        {!isCreating && !selected ? (
          <p className="text-sm text-muted">{t.serviceCatalog.detail.selectPrompt}</p>
        ) : (
          <div className="flex flex-col gap-3.5">
             <FormField label={t.serviceCatalog.fields.name} htmlFor="service-template-name" required>
               <Input id="service-template-name" value={activeForm.name} onChange={(e) => updateField('name', e.target.value)} placeholder={t.serviceCatalog.fields.namePlaceholder} />
             </FormField>
             <div className="grid grid-cols-2 gap-3">
               <FormField label={t.serviceCatalog.detail.unit} htmlFor="service-template-unit">
                 <Input id="service-template-unit" value={activeForm.unit} onChange={(e) => updateField('unit', e.target.value)} placeholder="szt." />
               </FormField>
               <FormField label={t.serviceCatalog.detail.vatRate} htmlFor="service-template-vat-rate">
                 <Select id="service-template-vat-rate" value={activeForm.vatRate} onChange={(e) => updateField('vatRate', e.target.value as VatRate)}>
                  {VAT_RATES.map((rate) => <option key={rate} value={rate}>{VAT_RATE_LABELS[rate]}</option>)}
                </Select>
              </FormField>
            </div>
             <FormField label={t.serviceCatalog.detail.description} htmlFor="service-template-description">
               <Input id="service-template-description" value={activeForm.description} onChange={(e) => updateField('description', e.target.value)} placeholder={t.serviceCatalog.fields.descriptionPlaceholder} />
            </FormField>

            <div className="mt-auto flex gap-2 pt-2">
              {!isCreating && selected ? (
                selected.isActive ? (
                   <Button type="button" variant="danger" className="flex-1" onClick={() => setTemplateToArchive(selected)} disabled={submitting}>
                    {t.serviceCatalog.actions.deactivate}
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" className="flex-1" onClick={handleRestore} disabled={submitting}>
                    {t.serviceCatalog.actions.restore}
                  </Button>
                )
              ) : null}
              <Button type="button" className="flex-1" onClick={handleSave} disabled={submitting}>
                {submitting ? t.serviceCatalog.actions.saving : t.serviceCatalog.actions.save}
              </Button>
            </div>
          </div>
        )}
      </div>

      <NativeDialog
        open={templateToArchive !== null}
        onClose={() => setTemplateToArchive(null)}
        title={t.serviceCatalog.actions.deactivate}
      >
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" data-dialog-cancel onClick={() => setTemplateToArchive(null)} disabled={submitting}>
            {t.serviceCatalog.actions.cancel}
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              if (!templateToArchive) return;
              const templateId = templateToArchive.id;
              setTemplateToArchive(null);
              executeArchive(templateId);
            }}
            disabled={submitting}
          >
            {t.serviceCatalog.actions.deactivate}
          </Button>
        </div>
      </NativeDialog>
    </div>
  );
}

function HeaderCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.13em] text-muted ${className}`}>{children}</th>;
}

function BodyCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}

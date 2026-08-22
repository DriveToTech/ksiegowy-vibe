'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Contractor } from '../../../lib/api-types';
import { Badge } from '../../../components/atoms/Badge';
import { Button } from '../../../components/atoms/Button';
import { Input } from '../../../components/atoms/Input';
import { Banner } from '../../../components/molecules/Banner';
import { cn } from '../../../lib/cn';
import { t } from '../../../lib/translations';

type StatusFilter = 'all' | 'active' | 'inactive';

export function ContractorList({
  contractors,
  canEdit,
}: {
  contractors: Contractor[];
  canEdit: boolean;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [selectedId, setSelectedId] = useState<string | null>(contractors[0]?.id ?? null);

  const filtered = useMemo(() => contractors.filter((contractor) => {
    const matchesSearch =
      search.trim() === '' ||
      contractor.name.toLowerCase().includes(search.toLowerCase()) ||
      (contractor.nip ?? '').includes(search.trim());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && contractor.isActive) ||
      (statusFilter === 'inactive' && !contractor.isActive);

    return matchesSearch && matchesStatus;
  }), [contractors, search, statusFilter]);

  const effectiveSelectedId = filtered.some((contractor) => contractor.id === selectedId)
    ? selectedId
    : filtered[0]?.id ?? null;
  const selected = contractors.find((contractor) => contractor.id === effectiveSelectedId) ?? null;
  const missingNipCount = contractors.filter((contractor) => !contractor.nip).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_372px] lg:items-start">
      <div className="space-y-4">
        {missingNipCount > 0 ? (
          <Banner tone="warning">{t.contractors.dataQuality.missingNip(missingNipCount)}</Banner>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <Input
              type="search"
              placeholder={t.contractors.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1 rounded-control border border-outline bg-surface-panel p-1">
            {(['all', 'active', 'inactive'] as StatusFilter[]).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                className={cn(
                  'rounded-control px-3 py-1.5 text-xs font-semibold transition',
                  statusFilter === filter ? 'bg-primary text-primary-ink' : 'text-muted hover:text-foreground',
                )}
              >
                {filter === 'all'
                  ? t.contractors.filterAll
                  : filter === 'active'
                    ? t.contractors.filterActive
                    : t.contractors.filterInactive}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-card border border-outline bg-surface-panel p-6 text-center text-sm text-muted">
            {search.trim() || statusFilter !== 'all' ? t.contractors.emptyFiltered : t.contractors.emptyList}
          </p>
        ) : (
          <div className="overflow-hidden rounded-card border border-outline bg-surface-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="bg-surface-muted text-left">
                    <HeaderCell>{t.contractors.columns.name}</HeaderCell>
                    <HeaderCell>{t.contractors.columns.nip}</HeaderCell>
                    <HeaderCell className="text-right">{t.contractors.columns.status}</HeaderCell>
                    {canEdit ? <HeaderCell className="text-right lg:hidden">{t.contractors.actions.edit}</HeaderCell> : null}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((contractor) => (
                    <tr
                      key={contractor.id}
                      onClick={() => setSelectedId(contractor.id)}
                      className={cn(
                        'cursor-pointer border-t border-outline transition hover:bg-surface-row-hover',
                        contractor.id === effectiveSelectedId && 'bg-surface-row-hover',
                      )}
                    >
                      <BodyCell className="font-medium text-foreground">{contractor.name}</BodyCell>
                      <BodyCell className={contractor.nip ? 'font-mono text-xs text-foreground-secondary' : 'font-mono text-xs text-error-ink'}>
                        {contractor.nip ?? '—'}
                      </BodyCell>
                      <BodyCell className="text-right">
                        <Badge tone={contractor.isActive ? 'success' : 'draft'}>
                          {contractor.isActive ? t.contractors.status.active : t.contractors.status.inactive}
                        </Badge>
                      </BodyCell>
                      {canEdit ? (
                        <BodyCell className="text-right lg:hidden">
                          <Link
                            href={`/dashboard/contractors/${contractor.id}/edit`}
                            onClick={(event) => event.stopPropagation()}
                            className="text-xs font-semibold text-primary-strong transition hover:text-primary"
                          >
                            {t.contractors.actions.edit}
                          </Link>
                        </BodyCell>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="hidden rounded-card border border-outline bg-chrome p-[22px] lg:block">
        {selected ? (
          <ContractorDetail contractor={selected} canEdit={canEdit} onClose={() => setSelectedId(null)} />
        ) : (
          <p className="text-sm text-muted">{t.contractors.detail.selectPrompt}</p>
        )}
      </div>
    </div>
  );
}

function ContractorDetail({
  contractor,
  canEdit,
  onClose,
}: {
  contractor: Contractor;
  canEdit: boolean;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[17px] font-semibold leading-tight text-foreground">{contractor.name}</p>
          {contractor.nip ? <p className="font-mono text-xs text-muted">NIP {contractor.nip}</p> : null}
        </div>
        <button type="button" onClick={onClose} className="text-[12.5px] text-muted transition hover:text-foreground">
          {t.contractors.detail.close}
        </button>
      </div>

      <div className="flex flex-col gap-2.5 rounded-card border border-outline bg-surface-panel p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.contractors.detail.eyebrow}</p>
        <DetailRow label={t.contractors.detail.status}>
          <Badge tone={contractor.isActive ? 'success' : 'draft'}>
            {contractor.isActive ? t.contractors.status.active : t.contractors.status.inactive}
          </Badge>
        </DetailRow>
        <DetailRow label={t.contractors.detail.address}>
          {contractor.addressLine1 ? `${contractor.addressLine1}${contractor.addressLine2 ? `, ${contractor.addressLine2}` : ''}` : '—'}
        </DetailRow>
        <DetailRow label={t.contractors.detail.email}>{contractor.email ?? '—'}</DetailRow>
        <DetailRow label={t.contractors.detail.phone}>{contractor.phone ?? '—'}</DetailRow>
        <DetailRow label={t.contractors.detail.bankAccount}>{contractor.bankAccount ?? '—'}</DetailRow>
        {contractor.notes ? <DetailRow label={t.contractors.detail.notes}>{contractor.notes}</DetailRow> : null}
      </div>

      {canEdit ? (
        <div className="mt-auto flex gap-2">
          <Link href={`/dashboard/contractors/${contractor.id}/edit`} className="flex-1">
            <Button variant="secondary" className="w-full">{t.contractors.detail.editButton}</Button>
          </Link>
          <Link href="/dashboard/invoices/new" className="flex-1">
            <Button className="w-full">{t.contractors.detail.newInvoiceButton}</Button>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12.5px]">
      <span className="text-muted">{label}</span>
      <span className="max-w-[190px] text-right font-medium text-foreground">{children}</span>
    </div>
  );
}

function HeaderCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.13em] text-muted ${className}`}>{children}</th>;
}

function BodyCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Contractor } from '../../../lib/api-types';
import { Button } from '../../../components/atoms/Button';
import { Input } from '../../../components/atoms/Input';
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

  const filtered = contractors.filter((contractor) => {
    const matchesSearch =
      search.trim() === '' ||
      contractor.name.toLowerCase().includes(search.toLowerCase()) ||
      (contractor.nip ?? '').includes(search.trim());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && contractor.isActive) ||
      (statusFilter === 'inactive' && !contractor.isActive);

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <Input
            type="search"
            placeholder={t.contractors.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1 rounded-full border border-outline bg-surface-panel/40 p-1">
          {(['all', 'active', 'inactive'] as StatusFilter[]).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === filter
                  ? 'bg-primary text-primary-ink shadow-sm'
                  : 'text-muted hover:text-foreground'
              }`}
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

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="rounded-[1.5rem] border border-outline bg-surface-panel/40 p-6 text-center text-sm text-muted">
          {search.trim() || statusFilter !== 'all'
            ? t.contractors.emptyFiltered
            : t.contractors.emptyList}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[1.75rem] border border-outline bg-surface-panel/55 backdrop-blur-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline">
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.15em] text-muted">
                  {t.contractors.columns.name}
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.15em] text-muted">
                  {t.contractors.columns.nip}
                </th>
                <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.15em] text-muted md:table-cell">
                  {t.contractors.columns.email}
                </th>
                <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.15em] text-muted xl:table-cell">
                  {t.contractors.columns.address}
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.15em] text-muted">
                  {t.contractors.columns.status}
                </th>
                <th className="px-4 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((contractor, index) => (
                <tr
                  key={contractor.id}
                  className={`border-b border-outline transition hover:bg-surface-raised/30 ${
                    index === filtered.length - 1 ? 'border-b-0' : ''
                  }`}
                >
                  <td className="px-5 py-4">
                    <span className="font-semibold text-foreground">{contractor.name}</span>
                  </td>
                  <td className="px-4 py-4 tabular-nums text-muted">
                    {contractor.nip ?? '—'}
                  </td>
                  <td className="hidden px-4 py-4 text-muted md:table-cell">
                    {contractor.email ?? '—'}
                  </td>
                  <td className="hidden px-4 py-4 text-muted xl:table-cell">
                    {contractor.addressLine1 ?? '—'}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        contractor.isActive
                          ? 'bg-success text-success-ink'
                          : 'bg-surface-raised/60 text-muted'
                      }`}
                    >
                      {contractor.isActive
                        ? t.contractors.status.active
                        : t.contractors.status.inactive}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    {canEdit ? (
                      <Link href={`/dashboard/contractors/${contractor.id}/edit`}>
                        <Button type="button" variant="ghost" size="sm">
                          {t.contractors.actions.edit}
                        </Button>
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

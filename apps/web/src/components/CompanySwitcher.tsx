'use client';

import { useRouter } from 'next/navigation';
import type { Company } from '../lib/api-types';
import { t } from '../lib/translations';
import { Select } from './atoms/Select';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function CompanySwitcher({
  companies,
  activeCompanyId,
  compact = false,
}: {
  companies: Company[];
  activeCompanyId: string | null;
  compact?: boolean;
}) {
  const router = useRouter();

  if (companies.length === 0) return null;

  if (companies.length === 1) {
    return (
      <span
        title={companies[0]?.name}
        className="flex min-h-11 min-w-0 items-center truncate rounded-control bg-surface-raised px-3 text-sm font-semibold text-foreground"
      >
        {companies[0]?.name}
      </span>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    document.cookie = `active_company=${e.target.value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    router.refresh();
  };

  return (
    <Select
      value={activeCompanyId ?? ''}
      onChange={handleChange}
      aria-label={t.companySwitcher.selectCompany}
      title={companies.find((company) => company.id === activeCompanyId)?.name}
      className={compact ? 'min-w-0 sm:w-56' : 'max-w-full'}
    >
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}

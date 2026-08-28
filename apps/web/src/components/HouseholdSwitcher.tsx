'use client';

import { useRouter } from 'next/navigation';
import type { HouseholdSummary } from '../lib/api-types';
import { t } from '../lib/translations';
import { Select } from './atoms/Select';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function HouseholdSwitcher({
  households,
  activeHouseholdId,
  compact = false,
}: {
  households: HouseholdSummary[];
  activeHouseholdId: string | null;
  compact?: boolean;
}) {
  const router = useRouter();

  if (households.length === 0) return null;

  if (households.length === 1) {
    return (
      <span
        title={households[0]?.name}
        className="flex min-h-11 min-w-0 items-center truncate rounded-control bg-surface-raised px-3 text-sm font-semibold text-foreground lg:h-8 lg:min-h-0 lg:border lg:border-outline lg:bg-secondary-surface lg:text-[13px]"
      >
        {households[0]?.name}
      </span>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    document.cookie = `active_household=${e.target.value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    router.refresh();
  };

  return (
    <Select
      value={activeHouseholdId ?? ''}
      onChange={handleChange}
      aria-label={t.householdSwitcher.selectHousehold}
      title={households.find((household) => household.id === activeHouseholdId)?.name}
      className={compact ? 'min-w-0 sm:w-56 lg:h-8 lg:min-h-0' : 'max-w-full'}
    >
      {households.map((household) => (
        <option key={household.id} value={household.id}>
          {household.name}
        </option>
      ))}
    </Select>
  );
}

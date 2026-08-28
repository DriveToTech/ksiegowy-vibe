import type { HouseholdAccount } from './api-types';
import { t } from './translations';

/**
 * Format a numeric string or number as Polish currency: "1 234,56 zł"
 */
export function formatMoney(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  return num.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' });
}

/**
 * Parse a decimal number typed with either a comma or a dot separator
 * (e.g. "1234,56" or "1234.56") into a number. Returns null for anything
 * that isn't a valid decimal, including empty input. Logical inverse of
 * formatMoney's numeric parsing.
 */
export function parseDecimalValue(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

/**
 * Format an ISO date string (YYYY-MM-DD or full ISO) as dd.MM.yyyy
 */
export function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/**
 * True when a due date is today or already in the past — the signal that
 * decides whether a "Termin" column/row should read as a warning (amber)
 * rather than the default muted style reserved for distant, non-urgent dates.
 */
export function isDueSoonOrOverdue(value: string | undefined | null): boolean {
  if (!value) return false;
  const due = new Date(value);
  if (isNaN(due.getTime())) return false;
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()) <= todayUtc;
}

/**
 * The account picker's single badge chip (SHARED/CREDIT/PRIVATE/CASH occupy
 * the same slot in the design) — a plain function, not client-only, so both
 * the client AccountPicker and server-rendered pages (e.g. onboarding) can
 * call it directly.
 */
export function accountBadge(account: HouseholdAccount): { label: string; toneClass: string } {
  if (account.visibility === 'PRIVATE') {
    return { label: t.household.accountPicker.visibilityLabels.PRIVATE, toneClass: 'bg-surface-raised text-muted' };
  }
  if (account.type === 'CREDIT_CARD') {
    return { label: t.household.accountPicker.typeLabels.CREDIT_CARD, toneClass: 'bg-warning text-warning-ink' };
  }
  if (account.type === 'CASH') {
    return { label: t.household.accountPicker.typeLabels.CASH, toneClass: 'bg-surface-raised text-muted' };
  }
  return { label: t.household.accountPicker.visibilityLabels.SHARED, toneClass: 'bg-success text-success-ink' };
}

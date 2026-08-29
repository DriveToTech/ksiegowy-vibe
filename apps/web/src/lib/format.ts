import type { HouseholdAccount } from './api-types';
import { t } from './translations';

/**
 * Format a numeric string or number as Polish currency: "1 234,56 zł"
 */
export function formatMoney(value: string | number): string {
  const num = typeof value === 'string' ? parseDecimalValue(value) : value;
  if (num === null || !Number.isFinite(num)) return '—';
  return num.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' });
}

/**
 * Parse a decimal number typed with either a comma or a dot separator
 * (e.g. "1234,56" or "1234.56") into a number. Returns null for anything
 * that isn't a valid decimal, including empty input. Logical inverse of
 * formatMoney's numeric parsing.
 */
export function parseDecimalValue(value: string): number | null {
  const normalized = value.trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

/** Return today's date in the local calendar for a date input. */
export function todayAsCalendarDate(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

/**
 * Format an ISO date string (YYYY-MM-DD or full ISO) as dd.MM.yyyy
 */
export function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  const calendarDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (calendarDate) {
    const year = Number(calendarDate[1]);
    const month = Number(calendarDate[2]);
    const day = Number(calendarDate[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return value;
    return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
}

/**
 * True when a due date is today or already in the past — the signal that
 * decides whether a "Termin" column/row should read as a warning (amber)
 * rather than the default muted style reserved for distant, non-urgent dates.
 */
export function isDueSoonOrOverdue(value: string | undefined | null): boolean {
  if (!value) return false;
  const calendarDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!calendarDate) return false;
  const dueYear = Number(calendarDate[1]);
  const dueMonth = Number(calendarDate[2]);
  const dueDay = Number(calendarDate[3]);
  const due = new Date(dueYear, dueMonth - 1, dueDay);
  if (due.getFullYear() !== dueYear || due.getMonth() !== dueMonth - 1 || due.getDate() !== dueDay) return false;
  const today = new Date();
  return due.getTime() <= new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
}

/** Format a percentage value using Polish decimal separators. */
export function formatPercentage(value: string | number, minimumFractionDigits = 0, maximumFractionDigits = 2): string {
  const number = typeof value === 'string' ? parseDecimalValue(value) : value;
  if (number === null || !Number.isFinite(number)) return '—';
  return `${number.toLocaleString('pl-PL', { minimumFractionDigits, maximumFractionDigits })}%`;
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

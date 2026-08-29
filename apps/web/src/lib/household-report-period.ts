import type { HouseholdReportExportFormat } from './api-types';

export type HouseholdReportPeriodPreset = 'year-to-date' | 'previous-year' | 'last-12-months' | 'custom';

export interface HouseholdReportPeriod {
  preset: HouseholdReportPeriodPreset;
  from: string;
  to: string;
}

export interface HouseholdReportPeriodResult {
  period: HouseholdReportPeriod | null;
  error: 'INVALID_PRESET' | 'MISSING_DATE' | 'INVALID_DATE' | 'INVERTED_DATE_RANGE' | 'RANGE_TOO_LONG' | null;
}

const validPresets: HouseholdReportPeriodPreset[] = ['year-to-date', 'previous-year', 'last-12-months', 'custom'];

function dateParts(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

function parseCalendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return dateParts(date) === value ? date : null;
}

function shiftCalendarDate(value: Date, years: number, days = 0): Date {
  const shifted = new Date(Date.UTC(value.getUTCFullYear() + years, value.getUTCMonth(), value.getUTCDate() + days));
  if (shifted.getUTCMonth() !== (value.getUTCMonth() + (days < 0 ? 12 : 0)) % 12 && days === 0) {
    return new Date(Date.UTC(value.getUTCFullYear() + years, value.getUTCMonth() + 1, 0));
  }
  return shifted;
}

function presetDates(preset: Exclude<HouseholdReportPeriodPreset, 'custom'>, now: Date): Pick<HouseholdReportPeriod, 'from' | 'to'> {
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const year = today.getUTCFullYear();
  if (preset === 'year-to-date') return { from: `${year}-01-01`, to: dateParts(today) };
  if (preset === 'previous-year') return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
  const oneYearAgo = shiftCalendarDate(today, -1);
  oneYearAgo.setUTCDate(oneYearAgo.getUTCDate() + 1);
  return { from: dateParts(oneYearAgo), to: dateParts(today) };
}

export function validateHouseholdReportDateRange(from: string, to: string): HouseholdReportPeriodResult['error'] {
  const fromDate = parseCalendarDate(from);
  const toDate = parseCalendarDate(to);
  if (!fromDate || !toDate) return 'INVALID_DATE';
  if (fromDate > toDate) return 'INVERTED_DATE_RANGE';
  const maximumToDate = new Date(Date.UTC(fromDate.getUTCFullYear() + 1, fromDate.getUTCMonth(), fromDate.getUTCDate()));
  return toDate >= maximumToDate ? 'RANGE_TOO_LONG' : null;
}

export function parseHouseholdReportPeriod(
  query: Record<string, string | string[] | undefined>,
  now = new Date(),
): HouseholdReportPeriodResult {
  const requestedPreset = Array.isArray(query.preset) ? query.preset[0] : query.preset;
  const preset = requestedPreset === undefined ? 'year-to-date' : validPresets.includes(requestedPreset as HouseholdReportPeriodPreset) ? requestedPreset as HouseholdReportPeriodPreset : null;
  if (!preset) return { period: null, error: 'INVALID_PRESET' };

  if (preset !== 'custom' && query.from === undefined && query.to === undefined) {
    return { period: { preset, ...presetDates(preset, now) }, error: null };
  }

  const from = Array.isArray(query.from) ? query.from[0] : query.from;
  const to = Array.isArray(query.to) ? query.to[0] : query.to;
  if (!from || !to) return { period: null, error: 'MISSING_DATE' };
  const error = validateHouseholdReportDateRange(from, to);
  return error ? { period: null, error } : { period: { preset, from, to }, error: null };
}

export function buildHouseholdReportQuery(period: HouseholdReportPeriod): string {
  const query = new URLSearchParams({ preset: period.preset });
  if (period.preset === 'custom') {
    query.set('from', period.from);
    query.set('to', period.to);
  }
  return query.toString();
}

export function buildHouseholdReportExportQuery(from: string, to: string, format: HouseholdReportExportFormat): string {
  const error = validateHouseholdReportDateRange(from, to);
  if (error) throw new Error('Report export requires a valid inclusive date range');
  return new URLSearchParams({ from, to, format }).toString();
}

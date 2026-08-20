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

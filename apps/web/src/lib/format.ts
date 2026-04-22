/**
 * Format a numeric string or number as Polish currency: "1 234,56 zł"
 */
export function formatMoney(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  return num.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' });
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

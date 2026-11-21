import type { VatRate } from './api-types';
import { parseDecimalValue } from './format';

export interface LineItem {
  name: string;
  quantity: string;
  unit: string;
  unitNetPrice: string;
  vatRate: VatRate;
}

export const VAT_RATES: VatRate[] = ['23', '8', '5', '0', 'zw', 'np', 'oo'];

export const VAT_RATE_LABELS: Record<VatRate, string> = {
  '23': '23%',
  '8': '8%',
  '5': '5%',
  '0': '0%',
  zw: 'zw.',
  np: 'np.',
  oo: 'oo.',
};

export function emptyLine(): LineItem {
  return { name: '', quantity: '1', unit: 'szt.', unitNetPrice: '', vatRate: '23' };
}

export function vatMultiplier(rate: VatRate): number {
  if (rate === 'zw' || rate === 'np' || rate === 'oo') return 0;
  return parseInt(rate, 10) / 100;
}

export function calcLine(line: LineItem): { net: number; vat: number; gross: number } {
  const qty = parseDecimalValue(line.quantity) ?? 0;
  const price = parseDecimalValue(line.unitNetPrice) ?? 0;
  const net = Math.round(qty * price * 100) / 100;
  const vat = Math.round(net * vatMultiplier(line.vatRate) * 100) / 100;
  return { net, vat, gross: Math.round((net + vat) * 100) / 100 };
}

export function calcLineTotals(lines: LineItem[]): { net: number; vat: number; gross: number } {
  return lines.reduce(
    (accumulator, line) => {
      const { net, vat, gross } = calcLine(line);
      return {
        net: Math.round((accumulator.net + net) * 100) / 100,
        vat: Math.round((accumulator.vat + vat) * 100) / 100,
        gross: Math.round((accumulator.gross + gross) * 100) / 100,
      };
    },
    { net: 0, vat: 0, gross: 0 },
  );
}

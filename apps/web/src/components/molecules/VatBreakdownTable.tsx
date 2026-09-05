import type { VatRate } from '../../lib/api-types';
import { formatMoney } from '../../lib/format';

const VAT_RATES: VatRate[] = ['23', '8', '5', '0', 'zw', 'np', 'oo'];

const VAT_RATE_LABELS: Record<VatRate, string> = {
  '23': '23%',
  '8': '8%',
  '5': '5%',
  '0': '0%',
  zw: 'zw.',
  np: 'np.',
  oo: 'oo.',
};

interface LineInput {
  quantity: string;
  unitNetPrice: string;
  vatRate: VatRate;
}

interface VatBreakdownTableProps {
  lines: LineInput[];
  totals: { net: number; vat: number; gross: number };
}

function vatMultiplier(rate: VatRate): number {
  if (rate === 'zw' || rate === 'np' || rate === 'oo') return 0;
  return parseInt(rate, 10) / 100;
}

function calcLine(line: LineInput): { net: number; vat: number; gross: number } {
  const qty = parseFloat(line.quantity) || 0;
  const price = parseFloat(line.unitNetPrice) || 0;
  const net = Math.round(qty * price * 100) / 100;
  const vat = Math.round(net * vatMultiplier(line.vatRate) * 100) / 100;
  return { net, vat, gross: Math.round((net + vat) * 100) / 100 };
}

function groupByVatRate(lines: LineInput[]): Array<{ rate: VatRate; net: number; vat: number; gross: number }> {
  const map = new Map<VatRate, { net: number; vat: number; gross: number }>();
  for (const line of lines) {
    const { net, vat, gross } = calcLine(line);
    if (net === 0 && vat === 0 && gross === 0) continue;
    const existing = map.get(line.vatRate) ?? { net: 0, vat: 0, gross: 0 };
    map.set(line.vatRate, {
      net: Math.round((existing.net + net) * 100) / 100,
      vat: Math.round((existing.vat + vat) * 100) / 100,
      gross: Math.round((existing.gross + gross) * 100) / 100,
    });
  }
  return VAT_RATES.filter((r) => map.has(r)).map((r) => ({ rate: r, ...map.get(r)! }));
}

export function VatBreakdownTable({ lines, totals }: VatBreakdownTableProps) {
  const breakdown = groupByVatRate(lines);

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">
            <th className="pb-3 text-left">Stawka VAT</th>
            <th className="pb-3 text-right">Suma netto</th>
            <th className="pb-3 text-right">Suma VAT</th>
            <th className="pb-3 text-right">Suma brutto</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-2 text-muted">
                Brak pozycji
              </td>
            </tr>
          ) : (
            breakdown.map(({ rate, net, vat, gross }) => (
              <tr key={rate}>
                <td className="py-1.5 font-medium text-foreground">{VAT_RATE_LABELS[rate]}</td>
                <td className="py-1.5 tabular-nums text-right text-muted">{formatMoney(net)}</td>
                <td className="py-1.5 tabular-nums text-right text-muted">{formatMoney(vat)}</td>
                <td className="py-1.5 tabular-nums text-right text-muted">{formatMoney(gross)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-outline">
            <td className="pt-3 font-semibold text-foreground">Razem</td>
            <td className="pt-3 font-semibold tabular-nums text-right text-foreground">{formatMoney(totals.net)}</td>
            <td className="pt-3 font-semibold tabular-nums text-right text-foreground">{formatMoney(totals.vat)}</td>
            <td className="pt-3 font-semibold tabular-nums text-right text-foreground">{formatMoney(totals.gross)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="mt-5 space-y-1.5 border-t border-outline pt-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted">Kwota do zapłaty</span>
          <span className="font-semibold tabular-nums text-foreground">{formatMoney(totals.gross)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">Zapłacono</span>
          <span className="tabular-nums text-muted">{formatMoney(0)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">Pozostaje do zapłaty</span>
          <span className="font-semibold tabular-nums text-foreground">{formatMoney(totals.gross)}</span>
        </div>
      </div>
    </div>
  );
}

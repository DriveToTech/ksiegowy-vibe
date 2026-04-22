export interface VatLineInput {
  readonly quantity: number;
  readonly unitNetPrice: number;
  readonly vatRatePercent: number;
}

export interface VatLineTotals {
  readonly net: number;
  readonly vat: number;
  readonly gross: number;
}

const round2 = (value: number): number => {
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

export const computeVatLineTotals = (line: VatLineInput): VatLineTotals => {
  const net = round2(line.quantity * line.unitNetPrice);
  const vat = round2((net * line.vatRatePercent) / 100);

  return {
    net,
    vat,
    gross: round2(net + vat)
  };
};

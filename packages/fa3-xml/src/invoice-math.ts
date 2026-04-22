import type { InvoiceData, InvoiceLineInput, VatRate } from '@ksiegowy/types';

import { Fa3ContractError } from './contracts.js';

const DECIMAL_PATTERN = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/;

const ZERO_VAT_RATES: ReadonlySet<VatRate> = new Set<VatRate>(['0', 'zw', 'np', 'oo']);

const VAT_FACTORS: Readonly<Record<VatRate, string>> = {
  '23': '0.23',
  '8': '0.08',
  '5': '0.05',
  '0': '0',
  zw: '0',
  np: '0',
  oo: '0'
};

interface DecimalValue {
  readonly unscaled: bigint;
  readonly scale: number;
}

export interface CalculatedInvoiceLine {
  readonly lineNumber: number;
  readonly description: string;
  readonly quantity: string;
  readonly unit: string;
  readonly unitNetPrice: string;
  readonly vatRate: VatRate;
  readonly net: string;
  readonly vat: string;
  readonly gross: string;
}

export interface VatBreakdownRow {
  readonly vatRate: VatRate;
  readonly net: string;
  readonly vat: string;
  readonly gross: string;
}

export interface CalculatedInvoiceTotals {
  readonly net: string;
  readonly vat: string;
  readonly gross: string;
}

export interface CalculatedInvoice {
  readonly lines: readonly CalculatedInvoiceLine[];
  readonly totals: CalculatedInvoiceTotals;
  readonly breakdown: readonly VatBreakdownRow[];
}

const powerOfTen = (exponent: number): bigint => {
  return 10n ** BigInt(exponent);
};

const parseDecimal = (value: string, fieldName: string): DecimalValue => {
  const trimmedValue = value.trim();
  const match = DECIMAL_PATTERN.exec(trimmedValue);

  if (match === null) {
    throw new Fa3ContractError(
      'INVALID_INVOICE_DATA',
      `Invalid decimal value for ${fieldName}: ${value}`
    );
  }

  const sign = match[1] === '-' ? -1n : 1n;
  const fraction = match[3] === undefined ? '' : match[3];
  const normalized = `${trimmedValue.replace('-', '').replace('.', '')}`;

  return {
    unscaled: BigInt(normalized) * sign,
    scale: fraction.length
  };
};

const normalizeScale = (value: DecimalValue, scale: number): DecimalValue => {
  if (value.scale === scale) {
    return value;
  }

  if (value.scale > scale) {
    return roundToScale(value, scale);
  }

  return {
    unscaled: value.unscaled * powerOfTen(scale - value.scale),
    scale
  };
};

const roundToScale = (value: DecimalValue, scale: number): DecimalValue => {
  if (value.scale <= scale) {
    return normalizeScale(value, scale);
  }

  const factor = powerOfTen(value.scale - scale);
  const isNegative = value.unscaled < 0n;
  const absoluteUnscaled = isNegative ? -value.unscaled : value.unscaled;
  const quotient = absoluteUnscaled / factor;
  const remainder = absoluteUnscaled % factor;
  const roundedAbsoluteUnscaled = remainder * 2n >= factor ? quotient + 1n : quotient;

  return {
    unscaled: isNegative ? -roundedAbsoluteUnscaled : roundedAbsoluteUnscaled,
    scale
  };
};

const add = (left: DecimalValue, right: DecimalValue): DecimalValue => {
  const targetScale = Math.max(left.scale, right.scale);
  const normalizedLeft = normalizeScale(left, targetScale);
  const normalizedRight = normalizeScale(right, targetScale);

  return {
    unscaled: normalizedLeft.unscaled + normalizedRight.unscaled,
    scale: targetScale
  };
};

const multiply = (left: DecimalValue, right: DecimalValue): DecimalValue => {
  return {
    unscaled: left.unscaled * right.unscaled,
    scale: left.scale + right.scale
  };
};

const formatDecimal = (value: DecimalValue, scale = 2): string => {
  const normalized = normalizeScale(value, scale);
  const isNegative = normalized.unscaled < 0n;
  const raw = (isNegative ? -normalized.unscaled : normalized.unscaled).toString();

  if (scale === 0) {
    return `${isNegative ? '-' : ''}${raw}`;
  }

  const padded = raw.padStart(scale + 1, '0');
  const integerPart = padded.slice(0, -scale);
  const fractionPart = padded.slice(-scale);

  return `${isNegative ? '-' : ''}${integerPart}.${fractionPart}`;
};

const getVatFactor = (vatRate: VatRate): DecimalValue => {
  return parseDecimal(VAT_FACTORS[vatRate], `VAT factor for rate ${vatRate}`);
};

const computeLineTotals = (
  line: InvoiceLineInput,
  index: number
): CalculatedInvoiceLine => {
  const quantity = parseDecimal(line.quantity, `lines[${index}].quantity`);
  const unitNetPrice = parseDecimal(line.unitNetPrice, `lines[${index}].unitNetPrice`);
  const net = roundToScale(multiply(quantity, unitNetPrice), 2);
  const vat = ZERO_VAT_RATES.has(line.vatRate)
    ? normalizeScale(parseDecimal('0', `lines[${index}].vat`), 2)
    : roundToScale(multiply(net, getVatFactor(line.vatRate)), 2);
  const gross = add(net, vat);

  return {
    lineNumber: index + 1,
    description: line.description,
    quantity: formatDecimal(quantity, Math.max(quantity.scale, 0)),
    unit: line.unit,
    unitNetPrice: formatDecimal(unitNetPrice, Math.max(unitNetPrice.scale, 2)),
    vatRate: line.vatRate,
    net: formatDecimal(net),
    vat: formatDecimal(vat),
    gross: formatDecimal(gross)
  };
};

export const calculateInvoiceTotals = (invoice: InvoiceData): CalculatedInvoice => {
  if (invoice.lines.length === 0) {
    throw new Fa3ContractError('INVALID_INVOICE_DATA', 'Invoice must include at least one line');
  }

  const calculatedLines = invoice.lines.map((line, index) => computeLineTotals(line, index));

  const totals = calculatedLines.reduce(
    (accumulator, line) => {
      return {
        net: add(accumulator.net, parseDecimal(line.net, `lines[${line.lineNumber}].net`)),
        vat: add(accumulator.vat, parseDecimal(line.vat, `lines[${line.lineNumber}].vat`)),
        gross: add(accumulator.gross, parseDecimal(line.gross, `lines[${line.lineNumber}].gross`))
      };
    },
    {
      net: normalizeScale(parseDecimal('0', 'totalNet'), 2),
      vat: normalizeScale(parseDecimal('0', 'totalVat'), 2),
      gross: normalizeScale(parseDecimal('0', 'totalGross'), 2)
    }
  );

  const breakdownMap = new Map<VatRate, { net: DecimalValue; vat: DecimalValue; gross: DecimalValue }>();

  for (const line of calculatedLines) {
    const current = breakdownMap.get(line.vatRate) ?? {
      net: normalizeScale(parseDecimal('0', `breakdown.${line.vatRate}.net`), 2),
      vat: normalizeScale(parseDecimal('0', `breakdown.${line.vatRate}.vat`), 2),
      gross: normalizeScale(parseDecimal('0', `breakdown.${line.vatRate}.gross`), 2)
    };

    breakdownMap.set(line.vatRate, {
      net: add(current.net, parseDecimal(line.net, `breakdown.${line.vatRate}.net`)),
      vat: add(current.vat, parseDecimal(line.vat, `breakdown.${line.vatRate}.vat`)),
      gross: add(current.gross, parseDecimal(line.gross, `breakdown.${line.vatRate}.gross`))
    });
  }

  return {
    lines: calculatedLines,
    totals: {
      net: formatDecimal(totals.net),
      vat: formatDecimal(totals.vat),
      gross: formatDecimal(totals.gross)
    },
    breakdown: Array.from(breakdownMap.entries()).map(([vatRate, row]) => ({
      vatRate,
      net: formatDecimal(row.net),
      vat: formatDecimal(row.vat),
      gross: formatDecimal(row.gross)
    }))
  };
};

export const assertInvoiceMathConsistency = (invoice: InvoiceData): void => {
  const calculated = calculateInvoiceTotals(invoice);
  const mismatches: string[] = [];

  if (calculated.totals.net !== invoice.totalNet) {
    mismatches.push(`totalNet expected ${calculated.totals.net}, received ${invoice.totalNet}`);
  }

  if (calculated.totals.vat !== invoice.totalVat) {
    mismatches.push(`totalVat expected ${calculated.totals.vat}, received ${invoice.totalVat}`);
  }

  if (calculated.totals.gross !== invoice.totalGross) {
    mismatches.push(`totalGross expected ${calculated.totals.gross}, received ${invoice.totalGross}`);
  }

  if (mismatches.length > 0) {
    throw new Fa3ContractError(
      'INVOICE_TOTALS_MISMATCH',
      `Invoice totals do not match FA(3) rounding assumptions: ${mismatches.join('; ')}`
    );
  }
};

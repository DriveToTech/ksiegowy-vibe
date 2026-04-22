import type {
  InvoiceData,
  InvoiceParty,
  InvoicePaymentMethod,
  InvoiceType,
  VatRate
} from '@ksiegowy/types';

import { assertInvoiceMathConsistency, calculateInvoiceTotals } from './invoice-math.js';
import { FA3_PAYMENT_METHOD_CODES, Fa3ContractError } from './contracts.js';

const FA3_NAMESPACE = 'http://crd.gov.pl/wzor/2025/06/25/13775/';
const DEFAULT_SYSTEM_INFO = 'ksiegowy-vibe.pl FA(3) VAT builder';
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const KSEF_REFERENCE_PATTERN =
  /^([1-9]((\d[1-9])|([1-9]\d))\d{7}|M\d{9}|[A-Z]{3}\d{7})-(20[2-9][0-9]|2[1-9][0-9]{2}|[3-9][0-9]{3})(0[1-9]|1[0-2])(0[1-9]|[1-2][0-9]|3[0-1])-([0-9A-F]{6})-?([0-9A-F]{6})-([0-9A-F]{2})$/;
const FA3_BANK_ACCOUNT_PATTERN = /^[0-9A-Z]{10,32}$/;

// FA(3) P_12 VAT rate codes differ from FA(2) for 0% and np
const FA3_P12_CODES: Readonly<Record<VatRate, string>> = {
  '23': '23',
  '8': '8',
  '5': '5',
  '0': '0 KR',  // domestic 0% — was '0' in FA(2)
  zw: 'zw',
  np: 'np I',   // non-taxable — was 'np' in FA(2)
  oo: 'oo'
};

const xmlEscape = (value: string): string => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
};

const renderTag = (indent: number, name: string, value: string): string => {
  return `${' '.repeat(indent)}<${name}>${xmlEscape(value)}</${name}>`;
};

const renderParty = (indent: number, tagName: 'Podmiot1' | 'Podmiot2', party: InvoiceParty): string => {
  const lines = [
    `${' '.repeat(indent)}<${tagName}>`,
    `${' '.repeat(indent + 2)}<DaneIdentyfikacyjne>`,
    renderTag(indent + 4, 'NIP', party.nip),
    renderTag(indent + 4, 'Nazwa', party.name),
    `${' '.repeat(indent + 2)}</DaneIdentyfikacyjne>`,
    `${' '.repeat(indent + 2)}<Adres>`,
    renderTag(indent + 4, 'KodKraju', 'PL'),
    renderTag(indent + 4, 'AdresL1', party.addressLine1)
  ];

  if (party.addressLine2 !== undefined) {
    lines.push(renderTag(indent + 4, 'AdresL2', party.addressLine2));
  }

  lines.push(`${' '.repeat(indent + 2)}</Adres>`);

  // FA(3): Podmiot2 requires JST and GV flags (Podmiot1 does not)
  if (tagName === 'Podmiot2') {
    lines.push(renderTag(indent + 2, 'JST', '2'));  // 2 = not a JST sub-unit
    lines.push(renderTag(indent + 2, 'GV', '2'));   // 2 = not a VAT group
  }

  lines.push(`${' '.repeat(indent)}</${tagName}>`);
  return lines.join('\n');
};

const buildCreationTimestamp = (issueDate: string): string => {
  // FA(3) uses TDataCzas format with milliseconds
  return `${issueDate}T00:00:00.000Z`;
};

const resolveInvoiceType = (invoice: InvoiceData): InvoiceType => {
  return invoice.invoiceType ?? 'VAT';
};

const getPaymentMethodCode = (paymentMethod: InvoicePaymentMethod): string => {
  return FA3_PAYMENT_METHOD_CODES[paymentMethod];
};

const normalizePaymentBankAccount = (paymentBankAccount: string): string => {
  const normalized = paymentBankAccount.replaceAll(/\s+/g, '').toUpperCase();

  if (!FA3_BANK_ACCOUNT_PATTERN.test(normalized)) {
    throw new Fa3ContractError(
      'INVALID_INVOICE_DATA',
      'FA(3) paymentBankAccount must normalize to 10-32 uppercase alphanumeric characters'
    );
  }

  return normalized;
};

const renderPayment = (indent: number, invoice: InvoiceData): string[] => {
  const lines = [`${' '.repeat(indent)}<Platnosc>`];

  if (invoice.paymentDueDate !== undefined) {
    lines.push(`${' '.repeat(indent + 2)}<TerminPlatnosci>`);
    lines.push(renderTag(indent + 4, 'Termin', invoice.paymentDueDate));
    lines.push(`${' '.repeat(indent + 2)}</TerminPlatnosci>`);
  }

  if (invoice.paymentMethod !== undefined) {
    lines.push(renderTag(indent + 2, 'FormaPlatnosci', getPaymentMethodCode(invoice.paymentMethod)));
  }

  if (invoice.paymentBankAccount !== undefined) {
    lines.push(`${' '.repeat(indent + 2)}<RachunekBankowy>`);
    lines.push(renderTag(indent + 4, 'NrRB', normalizePaymentBankAccount(invoice.paymentBankAccount)));
    lines.push(`${' '.repeat(indent + 2)}</RachunekBankowy>`);
  }

  lines.push(`${' '.repeat(indent)}</Platnosc>`);
  return lines;
};

const renderCorrection = (indent: number, invoice: InvoiceData): string[] => {
  const correction = invoice.correction;

  if (correction === undefined) {
    throw new Fa3ContractError(
      'INVALID_INVOICE_DATA',
      'KOR invoice requires correction metadata with original invoice references'
    );
  }

  const lines = [] as string[];

  if (correction.reason !== undefined) {
    lines.push(renderTag(indent, 'PrzyczynaKorekty', correction.reason));
  }

  if (correction.impactType !== undefined) {
    lines.push(renderTag(indent, 'TypKorekty', correction.impactType));
  }

  lines.push(`${' '.repeat(indent)}<DaneFaKorygowanej>`);
  lines.push(renderTag(indent + 2, 'DataWystFaKorygowanej', correction.originalIssueDate));
  lines.push(renderTag(indent + 2, 'NrFaKorygowanej', correction.originalInvoiceNumber));
  lines.push(renderTag(indent + 2, 'NrKSeF', '1'));
  lines.push(renderTag(indent + 2, 'NrKSeFFaKorygowanej', correction.originalKsefReferenceNumber));
  lines.push(`${' '.repeat(indent)}</DaneFaKorygowanej>`);

  return lines;
};

const assertInvoiceVariantSupport = (invoice: InvoiceData): void => {
  const invoiceType = resolveInvoiceType(invoice);

  if (invoiceType === 'VAT') {
    if (invoice.correction !== undefined) {
      throw new Fa3ContractError(
        'INVALID_INVOICE_DATA',
        'VAT invoice cannot include correction metadata'
      );
    }
    return;
  }

  if (invoiceType === 'KOR') {
    if (
      invoice.correction?.originalKsefReferenceNumber === undefined ||
      invoice.correction.originalKsefReferenceNumber.trim().length === 0
    ) {
      throw new Fa3ContractError(
        'INVALID_INVOICE_DATA',
        'KOR invoice requires correction.originalKsefReferenceNumber from accepted KSeF submission'
      );
    }

    if (invoice.correction.originalInvoiceNumber.trim().length === 0) {
      throw new Fa3ContractError(
        'INVALID_INVOICE_DATA',
        'KOR invoice requires correction.originalInvoiceNumber'
      );
    }

    if (invoice.correction.originalIssueDate.trim().length === 0) {
      throw new Fa3ContractError(
        'INVALID_INVOICE_DATA',
        'KOR invoice requires correction.originalIssueDate'
      );
    }

    if (!ISO_DATE_PATTERN.test(invoice.correction.originalIssueDate)) {
      throw new Fa3ContractError(
        'INVALID_INVOICE_DATA',
        'KOR invoice requires correction.originalIssueDate in YYYY-MM-DD format'
      );
    }

    if (!KSEF_REFERENCE_PATTERN.test(invoice.correction.originalKsefReferenceNumber)) {
      throw new Fa3ContractError(
        'INVALID_INVOICE_DATA',
        'KOR invoice requires a schema-valid correction.originalKsefReferenceNumber'
      );
    }

    return;
  }

  throw new Fa3ContractError(
    'UNSUPPORTED_INVOICE_VARIANT',
    `Unsupported FA(3) invoice type for current builder slice: ${invoiceType}`
  );
};

const renderVatSummary = (indent: number, vatRate: VatRate, net: string, vat: string): string[] => {
  if (vatRate === '23') {
    return [renderTag(indent, 'P_13_1', net), renderTag(indent, 'P_14_1', vat)];
  }

  if (vatRate === '8') {
    return [renderTag(indent, 'P_13_2', net), renderTag(indent, 'P_14_2', vat)];
  }

  if (vatRate === '5') {
    return [renderTag(indent, 'P_13_3', net), renderTag(indent, 'P_14_3', vat)];
  }

  if (vatRate === '0') {
    return [renderTag(indent, 'P_13_6_1', net)];
  }

  if (vatRate === 'zw') {
    return [renderTag(indent, 'P_13_7', net)];
  }

  if (vatRate === 'np') {
    return [renderTag(indent, 'P_13_8', net)];
  }

  return [renderTag(indent, 'P_13_10', net)];
};

/**
 * Builds a materially real FA(3) XML document for standard VAT invoices.
 * FA(3) namespace: http://crd.gov.pl/wzor/2025/06/25/13775/
 * Required since FA(2) sunset (September 30, 2025).
 */
export const buildFa3Xml = (invoice: InvoiceData): string => {
  assertInvoiceVariantSupport(invoice);
  assertInvoiceMathConsistency(invoice);

  const calculated = calculateInvoiceTotals(invoice);
  const saleDate = invoice.saleDate ?? invoice.issueDate;
  const invoiceType = resolveInvoiceType(invoice);
  const hasPayment =
    invoice.paymentDueDate !== undefined ||
    invoice.paymentMethod !== undefined ||
    invoice.paymentBankAccount !== undefined;

  const xmlLines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Faktura xmlns="${FA3_NAMESPACE}">`,
    '  <Naglowek>',
    '    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>',
    renderTag(4, 'WariantFormularza', '3'),
    renderTag(4, 'DataWytworzeniaFa', buildCreationTimestamp(invoice.issueDate)),
    renderTag(4, 'SystemInfo', DEFAULT_SYSTEM_INFO),
    '  </Naglowek>',
    renderParty(2, 'Podmiot1', invoice.seller),
    renderParty(2, 'Podmiot2', invoice.buyer),
    '  <Fa>',
    renderTag(4, 'KodWaluty', invoice.currency),
    renderTag(4, 'P_1', invoice.issueDate),
    renderTag(4, 'P_2', invoice.invoiceNumber),
    renderTag(4, 'P_6', saleDate),
    ...calculated.breakdown.flatMap((row) => renderVatSummary(4, row.vatRate, row.net, row.vat)),
    renderTag(4, 'P_15', calculated.totals.gross),
    '    <Adnotacje>',
    renderTag(6, 'P_16', '2'),
    renderTag(6, 'P_17', '2'),
    renderTag(6, 'P_18', '2'),
    renderTag(6, 'P_18A', '2'),
    '      <Zwolnienie>',
    renderTag(8, 'P_19N', '1'),
    '      </Zwolnienie>',
    '      <NoweSrodkiTransportu>',
    renderTag(8, 'P_22N', '1'),
    '      </NoweSrodkiTransportu>',
    renderTag(6, 'P_23', '2'),
    '      <PMarzy>',
    renderTag(8, 'P_PMarzyN', '1'),
    '      </PMarzy>',
    '    </Adnotacje>',
    renderTag(4, 'RodzajFaktury', invoiceType),
    ...(invoiceType === 'KOR' ? renderCorrection(4, invoice) : []),
    ...calculated.lines.flatMap((line) => [
      '    <FaWiersz>',
      renderTag(6, 'NrWierszaFa', String(line.lineNumber)),
      renderTag(6, 'P_7', line.description),
      renderTag(6, 'P_8A', line.unit),
      renderTag(6, 'P_8B', line.quantity),
      renderTag(6, 'P_9A', line.unitNetPrice),
      renderTag(6, 'P_11', line.net),
      renderTag(6, 'P_12', FA3_P12_CODES[line.vatRate]),
      '    </FaWiersz>'
    ]),
    ...(hasPayment ? renderPayment(4, invoice) : []),
    '  </Fa>',
    '</Faktura>'
  ];

  return `${xmlLines.join('\n')}\n`;
};

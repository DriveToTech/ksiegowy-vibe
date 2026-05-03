import { describe, expect, it } from 'vitest';

import { parseFa3Xml } from './parser.js';

// Minimal valid FA(3) XML fragment for test use
const buildXml = (overrides: {
  invoiceNumber?: string;
  issueDate?: string;
  saleDate?: string;
  totalGross?: string;
  totalNetBands?: string;
  vatAmounts?: string;
  sellerNip?: string;
  sellerName?: string;
  sellerAdresL1?: string;
  sellerAdresL2?: string;
  buyerNip?: string;
  buyerName?: string;
  payment?: string;
  lineItems?: string;
} = {}): string => {
  const {
    invoiceNumber = 'FV 1/1/2025',
    issueDate = '2025-01-01',
    saleDate,
    totalGross = '123.00',
    totalNetBands = '<P_13_1>100.00</P_13_1>',
    vatAmounts = '<P_14_1>23.00</P_14_1>',
    sellerNip = '1234563218',
    sellerName = 'Test Seller',
    sellerAdresL1 = 'ul. Sprzedawcy 1',
    sellerAdresL2,
    buyerNip = '9876543210',
    buyerName = 'Test Buyer',
    payment = '',
    lineItems = ''
  } = overrides;

  const sellerAddress = sellerAdresL2
    ? `<AdresL1>${sellerAdresL1}</AdresL1><AdresL2>${sellerAdresL2}</AdresL2>`
    : `<AdresL1>${sellerAdresL1}</AdresL1>`;

  const saleDateTag = saleDate ? `<P_6>${saleDate}</P_6>` : '';

  return `
    <Faktura>
      <Podmiot1>
        <NIP>${sellerNip}</NIP>
        <Nazwa>${sellerName}</Nazwa>
        ${sellerAddress}
      </Podmiot1>
      <Podmiot2>
        <NIP>${buyerNip}</NIP>
        <Nazwa>${buyerName}</Nazwa>
      </Podmiot2>
      <Fa>
        <P_1>${issueDate}</P_1>
        <P_2>${invoiceNumber}</P_2>
        ${saleDateTag}
        <KodWaluty>PLN</KodWaluty>
        ${totalNetBands}
        ${vatAmounts}
        <P_15>${totalGross}</P_15>
        ${payment}
        ${lineItems}
      </Fa>
    </Faktura>
  `;
};

describe('parseFa3Xml()', () => {
  it('parses a minimal valid FA(3) XML into a structured object', () => {
    const result = parseFa3Xml(buildXml());

    expect(result.invoiceNumber).toBe('FV 1/1/2025');
    expect(result.issueDate).toBe('2025-01-01');
    expect(result.sellerNip).toBe('1234563218');
    expect(result.sellerName).toBe('Test Seller');
    expect(result.buyerNip).toBe('9876543210');
    expect(result.buyerName).toBe('Test Buyer');
    expect(result.totalGross).toBe('123.00');
    expect(result.currency).toBe('PLN');
  });

  it('concatenates seller address lines with comma when AdresL2 is present', () => {
    const result = parseFa3Xml(buildXml({
      sellerAdresL1: 'ul. Sprzedawcy 1',
      sellerAdresL2: '00-001 Warszawa'
    }));

    expect(result.sellerAddress).toBe('ul. Sprzedawcy 1, 00-001 Warszawa');
  });

  it('returns only AdresL1 as sellerAddress when AdresL2 is absent', () => {
    const result = parseFa3Xml(buildXml({ sellerAdresL1: 'ul. Sprzedawcy 1' }));

    expect(result.sellerAddress).toBe('ul. Sprzedawcy 1');
  });

  it('parses saleDate when P_6 tag is present', () => {
    const result = parseFa3Xml(buildXml({ saleDate: '2025-01-15' }));

    expect(result.saleDate).toBe('2025-01-15');
  });

  it('returns null for saleDate when P_6 tag is absent', () => {
    const result = parseFa3Xml(buildXml());

    expect(result.saleDate).toBeNull();
  });

  it('sums totalNet from multiple P_13_X bands', () => {
    const result = parseFa3Xml(buildXml({
      totalNetBands: '<P_13_1>100.00</P_13_1><P_13_2>50.00</P_13_2>',
      totalGross: '177.00'
    }));

    expect(result.totalNet).toBe('150.00');
  });

  it('extracts totalVat by summing P_14_X fields', () => {
    const result = parseFa3Xml(buildXml({
      vatAmounts: '<P_14_1>23.00</P_14_1><P_14_2>4.00</P_14_2>'
    }));

    expect(result.totalVat).toBe('27.00');
  });

  it('parses bank account from Platnosc block', () => {
    const payment = `
      <Platnosc>
        <FormaPlatnosci>6</FormaPlatnosci>
        <NrRB>00 1234 5678 9012 3456 7890 1234</NrRB>
        <TerminPlatnosci><Termin>2025-02-01</Termin></TerminPlatnosci>
      </Platnosc>
    `;
    const result = parseFa3Xml(buildXml({ payment }));

    expect(result.bankAccount).toBe('00 1234 5678 9012 3456 7890 1234');
    expect(result.paymentMethod).toBe('6');
    expect(result.dueDate).toBe('2025-02-01');
  });

  it('returns null for bankAccount, paymentMethod, dueDate when Platnosc is absent', () => {
    const result = parseFa3Xml(buildXml());

    expect(result.bankAccount).toBeNull();
    expect(result.paymentMethod).toBeNull();
    expect(result.dueDate).toBeNull();
  });

  it('parses a single line item', () => {
    const lineItems = `
      <FaWiersz>
        <NrWierszaFa>1</NrWierszaFa>
        <P_7>Usługa</P_7>
        <P_8A>szt</P_8A>
        <P_8B>2</P_8B>
        <P_9A>50.00</P_9A>
        <P_11>100.00</P_11>
        <P_11Vat>23.00</P_11Vat>
        <P_12>23</P_12>
      </FaWiersz>
    `;
    const result = parseFa3Xml(buildXml({ lineItems }));

    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0]).toMatchObject({
      position: 1,
      name: 'Usługa',
      unit: 'szt',
      quantity: '2',
      unitNetPrice: '50.00',
      netValue: '100.00',
      vatValue: '23.00',
      vatRate: '23'
    });
  });

  it('parses multiple line items', () => {
    const lineItems = `
      <FaWiersz>
        <NrWierszaFa>1</NrWierszaFa>
        <P_7>First</P_7>
        <P_8B>1</P_8B>
        <P_9A>10.00</P_9A>
        <P_11>10.00</P_11>
        <P_11Vat>2.30</P_11Vat>
        <P_12>23</P_12>
      </FaWiersz>
      <FaWiersz>
        <NrWierszaFa>2</NrWierszaFa>
        <P_7>Second</P_7>
        <P_8B>1</P_8B>
        <P_9A>20.00</P_9A>
        <P_11>20.00</P_11>
        <P_11Vat>4.60</P_11Vat>
        <P_12>23</P_12>
      </FaWiersz>
    `;
    const result = parseFa3Xml(buildXml({ lineItems }));

    expect(result.lineItems).toHaveLength(2);
    expect(result.lineItems[0]!.name).toBe('First');
    expect(result.lineItems[1]!.name).toBe('Second');
  });

  it('throws when invoiceNumber (P_2) is missing', () => {
    const xml = buildXml({ invoiceNumber: '' }).replace(/<P_2>[^<]*<\/P_2>/, '');

    expect(() => parseFa3Xml(xml)).toThrow('invoiceNumber');
  });

  it('uses fallbackInvoiceNumber when invoiceNumber (P_2) is missing', () => {
    const xml = buildXml({ invoiceNumber: '' }).replace(/<P_2>[^<]*<\/P_2>/, '');

    const result = parseFa3Xml(xml, { fallbackInvoiceNumber: 'KSEF-REF-123' });

    expect(result.invoiceNumber).toBe('KSEF-REF-123');
  });

  it('throws when issueDate (P_1) is missing', () => {
    const xml = buildXml().replace(/<P_1>[^<]*<\/P_1>/, '');

    expect(() => parseFa3Xml(xml)).toThrow('issueDate');
  });

  it('uses fallbackIssueDate when issueDate (P_1) is missing', () => {
    const xml = buildXml().replace(/<P_1>[^<]*<\/P_1>/, '');

    const result = parseFa3Xml(xml, { fallbackIssueDate: '2025-01-02' });

    expect(result.issueDate).toBe('2025-01-02');
  });

  it('throws when sellerNip (Podmiot1/NIP) is missing', () => {
    const xml = buildXml().replace(/<NIP>1234563218<\/NIP>/, '');

    expect(() => parseFa3Xml(xml)).toThrow('sellerNip');
  });

  it('uses fallbackSellerNip when sellerNip is missing', () => {
    const xml = buildXml().replace(/<NIP>1234563218<\/NIP>/, '');

    const result = parseFa3Xml(xml, { fallbackSellerNip: '9998887776' });

    expect(result.sellerNip).toBe('9998887776');
  });

  it('uses fallbackSellerName when sellerName is missing', () => {
    const xml = buildXml().replace(/<Nazwa>Test Seller<\/Nazwa>/, '');

    const result = parseFa3Xml(xml, { fallbackSellerName: 'Fallback Seller' });

    expect(result.sellerName).toBe('Fallback Seller');
  });

  it('derives zero totalGross when P_15 and amount bands are missing', () => {
    const xml = buildXml({ totalNetBands: '', vatAmounts: '' }).replace(/<P_15>[^<]*<\/P_15>/, '');

    const result = parseFa3Xml(xml);

    expect(result.totalGross).toBe('0.00');
  });

  it('uses fallbackTotalGross when totalGross is missing', () => {
    const xml = buildXml().replace(/<P_15>[^<]*<\/P_15>/, '');

    const result = parseFa3Xml(xml, { fallbackTotalGross: '456.78' });

    expect(result.totalGross).toBe('456.78');
  });

  it('derives totalGross from totalNet and totalVat when P_15 is missing', () => {
    const xml = buildXml({
      totalNetBands: '<P_13_1>100.00</P_13_1>',
      vatAmounts: '<P_14_1>23.00</P_14_1>',
      totalGross: '123.00'
    }).replace(/<P_15>[^<]*<\/P_15>/, '');

    const result = parseFa3Xml(xml);

    expect(result.totalGross).toBe('123.00');
  });
});

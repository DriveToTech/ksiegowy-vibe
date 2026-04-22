import type { InvoiceData } from '@ksiegowy/types';
import { describe, expect, it } from 'vitest';

import { buildFa3Xml } from './builder.js';
import { Fa3ContractError } from './contracts.js';
import { validateFa3XmlAgainstXsd } from './validator.js';

const canonicalFixture: InvoiceData = {
  invoiceNumber: 'FV 1/2/2026',
  issueDate: '2026-02-28',
  saleDate: '2026-02-28',
  invoiceType: 'VAT',
  currency: 'PLN',
  seller: {
    name: 'Acme Software sp. z o.o.',
    nip: '1234563218',
    addressLine1: 'ul. Testowa 1',
    addressLine2: '00-001 Warszawa'
  },
  buyer: {
    name: 'Example Client sp. z o.o.',
    nip: '9876543210',
    addressLine1: 'ul. Przykładowa 2',
    addressLine2: '00-002 Warszawa'
  },
  paymentDueDate: '2026-03-14',
  paymentMethod: 'bank_transfer',
  paymentBankAccount: '00 1234 5678 9012 3456 7890 1234',
  lines: [
    {
      description: 'Usługa programistyczna - utrzymanie platformy',
      quantity: '1',
      unit: 'usł.',
      unitNetPrice: '1000.00',
      vatRate: '23'
    },
    {
      description: 'Usługa programistyczna - rozwój modułu faktur',
      quantity: '1',
      unit: 'usł.',
      unitNetPrice: '1000.00',
      vatRate: '23'
    },
    {
      description: 'Usługa programistyczna - integracja KSeF',
      quantity: '1',
      unit: 'usł.',
      unitNetPrice: '1000.00',
      vatRate: '23'
    },
    {
      description: 'Prace analityczne i konsultacyjne',
      quantity: '1',
      unit: 'usł.',
      unitNetPrice: '200.00',
      vatRate: '23'
    },
    {
      description: 'Rozliczenie końcowe za luty 2026',
      quantity: '1',
      unit: 'usł.',
      unitNetPrice: '50.00',
      vatRate: '23'
    }
  ],
  totalNet: '3250.00',
  totalVat: '747.50',
  totalGross: '3997.50'
};

const firstLine = canonicalFixture.lines[0];
if (firstLine === undefined) {
  throw new Error('Canonical FA(3) fixture must contain at least one line');
}

describe('buildFa3Xml()', () => {
  it('emits the FA(3) namespace and form code', () => {
    const xml = buildFa3Xml(canonicalFixture);

    expect(xml).toContain('<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">');
    expect(xml).toContain('kodSystemowy="FA (3)"');
    expect(xml).toContain('<WariantFormularza>3</WariantFormularza>');
  });

  it('passes official MF FA(3) XSD validation', () => {
    const xml = buildFa3Xml(canonicalFixture);
    const result = validateFa3XmlAgainstXsd(xml);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('keeps legally critical fields in the emitted XML', () => {
    const xml = buildFa3Xml(canonicalFixture);

    expect(xml).toContain('<P_2>FV 1/2/2026</P_2>');
    expect(xml).toContain('<RodzajFaktury>VAT</RodzajFaktury>');
    expect(xml).toContain('<P_12>23</P_12>');
    expect(xml).toContain('<P_15>3997.50</P_15>');
    expect(xml).toContain('<Termin>2026-03-14</Termin>');
    expect(xml).toContain('<FormaPlatnosci>6</FormaPlatnosci>');
    expect(xml).toContain('<NrRB>00123456789012345678901234</NrRB>');
    expect(xml).toContain('<P_16>2</P_16>');
    expect(xml).toContain('<P_17>2</P_17>');
    expect(xml).toContain('<P_18>2</P_18>');
    expect(xml).toContain('<P_18A>2</P_18A>');
    expect(xml).toContain('<P_23>2</P_23>');
    expect(xml).toContain('<P_19N>1</P_19N>');
    expect(xml).toContain('<P_22N>1</P_22N>');
    expect(xml).toContain('<P_PMarzyN>1</P_PMarzyN>');
  });

  it('emits JST and GV flags for Podmiot2 (FA(3) requirement)', () => {
    const xml = buildFa3Xml(canonicalFixture);

    // JST and GV must appear after Podmiot2 Adres — not in Podmiot1
    const podmiot2Start = xml.indexOf('<Podmiot2>');
    const podmiot2End = xml.indexOf('</Podmiot2>');
    const podmiot2Block = xml.slice(podmiot2Start, podmiot2End);

    expect(podmiot2Block).toContain('<JST>2</JST>');
    expect(podmiot2Block).toContain('<GV>2</GV>');

    const podmiot1Start = xml.indexOf('<Podmiot1>');
    const podmiot1End = xml.indexOf('</Podmiot1>');
    const podmiot1Block = xml.slice(podmiot1Start, podmiot1End);

    expect(podmiot1Block).not.toContain('<JST>');
    expect(podmiot1Block).not.toContain('<GV>');
  });

  it('uses FA(3) P_12 code "0 KR" for domestic 0% VAT rate', () => {
    const invoice: InvoiceData = {
      ...canonicalFixture,
      lines: [
        {
          ...firstLine,
          vatRate: '0',
          unitNetPrice: '1000.00'
        }
      ],
      totalNet: '1000.00',
      totalVat: '0.00',
      totalGross: '1000.00'
    };

    const xml = buildFa3Xml(invoice);

    expect(xml).toContain('<P_12>0 KR</P_12>');
    expect(xml).not.toContain('<P_12>0</P_12>');
  });

  it('uses FA(3) P_12 code "np I" for non-taxable VAT rate', () => {
    const invoice: InvoiceData = {
      ...canonicalFixture,
      lines: [
        {
          ...firstLine,
          vatRate: 'np',
          unitNetPrice: '1000.00'
        }
      ],
      totalNet: '1000.00',
      totalVat: '0.00',
      totalGross: '1000.00'
    };

    const xml = buildFa3Xml(invoice);

    expect(xml).toContain('<P_12>np I</P_12>');
    expect(xml).not.toContain('<P_12>np</P_12>');
  });

  it('uses millisecond timestamp format for DataWytworzeniaFa', () => {
    const xml = buildFa3Xml(canonicalFixture);

    expect(xml).toContain('<DataWytworzeniaFa>2026-02-28T00:00:00.000Z</DataWytworzeniaFa>');
  });

  it('escapes XML-sensitive text nodes', () => {
    const invoice: InvoiceData = {
      ...canonicalFixture,
      buyer: {
        ...canonicalFixture.buyer,
        name: 'CONTRACTOR & <Partner> "Oddział"'
      },
      lines: [
        {
          ...firstLine,
          description: 'Analiza & wdrożenie <KSeF> "pilot"'
        }
      ],
      totalNet: '1000.00',
      totalVat: '230.00',
      totalGross: '1230.00'
    };

    const xml = buildFa3Xml(invoice);

    expect(xml).toContain('CONTRACTOR &amp; &lt;Partner&gt; &quot;Oddział&quot;');
    expect(xml).toContain('Analiza &amp; wdrożenie &lt;KSeF&gt; &quot;pilot&quot;');
  });

  it('fails fast when provided totals break line-level rounding assumptions', () => {
    const invoice: InvoiceData = {
      ...canonicalFixture,
      totalVat: '747.49'
    };

    expect(() => buildFa3Xml(invoice)).toThrowError(Fa3ContractError);
    expect(() => buildFa3Xml(invoice)).toThrowError(/FA\(3\) rounding assumptions/);
  });

  it('fails fast when payment bank account does not normalize to an accepted FA(3) value', () => {
    const invoice: InvoiceData = {
      ...canonicalFixture,
      paymentBankAccount: '00 1234 5678 !!!'
    };

    expect(() => buildFa3Xml(invoice)).toThrowError(Fa3ContractError);
    expect(() => buildFa3Xml(invoice)).toThrowError(/paymentBankAccount/);
  });

  it('builds schema-valid FA(3) KOR output when original KSeF reference is provided', () => {
    const invoice: InvoiceData = {
      ...canonicalFixture,
      invoiceType: 'KOR',
      invoiceNumber: 'FKOR 1/3/2026',
      issueDate: '2026-03-05',
      saleDate: '2026-03-05',
      correction: {
        originalInvoiceNumber: 'FV 1/2/2026',
        originalIssueDate: '2026-02-28',
        originalKsefReferenceNumber: '1234567890-20260228-ABCDEF-123456-78',
        reason: 'Korekta terminu płatności',
        impactType: '2'
      }
    };

    const xml = buildFa3Xml(invoice);
    const result = validateFa3XmlAgainstXsd(xml);

    expect(xml).toContain('<RodzajFaktury>KOR</RodzajFaktury>');
    expect(xml).toContain('<PrzyczynaKorekty>Korekta terminu płatności</PrzyczynaKorekty>');
    expect(xml).toContain('<TypKorekty>2</TypKorekty>');
    expect(xml).toContain('<NrKSeF>1</NrKSeF>');
    expect(xml).toContain(
      '<NrKSeFFaKorygowanej>1234567890-20260228-ABCDEF-123456-78</NrKSeFFaKorygowanej>'
    );
    expect(result.valid).toBe(true);
  });

  it('fails fast when KOR input omits original KSeF reference number', () => {
    const invoice: InvoiceData = {
      ...canonicalFixture,
      invoiceType: 'KOR',
      correction: {
        originalInvoiceNumber: 'FV 1/2/2026',
        originalIssueDate: '2026-02-28',
        originalKsefReferenceNumber: ''
      }
    };

    expect(() => buildFa3Xml(invoice)).toThrowError(Fa3ContractError);
    expect(() => buildFa3Xml(invoice)).toThrowError(
      /KOR invoice requires correction\.originalKsefReferenceNumber/
    );
  });

  it('fails fast when KOR input has non-schema-valid original KSeF reference number', () => {
    const invoice: InvoiceData = {
      ...canonicalFixture,
      invoiceType: 'KOR',
      correction: {
        originalInvoiceNumber: 'FV 1/2/2026',
        originalIssueDate: '2026-02-28',
        originalKsefReferenceNumber: 'BAD-KSEF-REF'
      }
    };

    expect(() => buildFa3Xml(invoice)).toThrowError(Fa3ContractError);
    expect(() => buildFa3Xml(invoice)).toThrowError(
      /schema-valid correction\.originalKsefReferenceNumber/
    );
  });
});

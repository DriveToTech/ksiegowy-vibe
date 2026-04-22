import type { InvoiceData } from '@ksiegowy/types';

export const canonicalFa3Fixture: InvoiceData = {
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

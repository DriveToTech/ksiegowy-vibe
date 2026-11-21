import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Builder } from 'builder-pattern';
import { describe, expect, it } from 'vitest';
import type { Contractor } from '../../lib/api-types';
import { InvoiceBuyerSection } from './InvoiceBuyerSection';
import { InvoiceLineItemsEditor } from './InvoiceLineItemsEditor';
import type { LineItem } from '../../lib/invoice-line-calculation';

describe('InvoiceLineItemsEditor()', () => {
  it('renders unique row labels, the design column order and the totals footer', () => {
    const lines = [
      Builder<LineItem>().name('Hosting').quantity('2').unit('mo.').unitNetPrice('100').vatRate('23').build(),
      Builder<LineItem>().name('Support').quantity('1').unit('h').unitNetPrice('50').vatRate('8').build(),
    ];
    const markup = renderToStaticMarkup(
      createElement(InvoiceLineItemsEditor, { lines, onLinesChange: () => undefined, contractorId: '' }),
    );

    expect(markup).toContain('aria-label="Nazwa, pozycja 1"');
    expect(markup).toContain('aria-label="Nazwa, pozycja 2"');
    expect(markup).toContain('aria-label="Usuń pozycję 2"');
    const headerOrder = ['#', 'Nazwa', 'J.m.', 'Ilość', 'Cena netto', 'VAT', 'Brutto'].map((label) =>
      markup.indexOf(`font-normal">${label}</th>`),
    );
    expect(headerOrder.every((position, index) => position > 0 && (index === 0 || position > headerOrder[index - 1]))).toBe(true);
    expect(markup).toContain('<dl');
    expect(markup).toContain('+ Dodaj pozycję');
  });

  it('hides the header add button below 760px container width', () => {
    const markup = renderToStaticMarkup(
      createElement(InvoiceLineItemsEditor, { lines: [], onLinesChange: () => undefined, contractorId: '' }),
    );
    const headerButtonClasses = /id="invoice-add-line-header"[^>]*class="([^"]*)"|class="([^"]*)"[^>]*id="invoice-add-line-header"/.exec(markup);
    const classes = (headerButtonClasses?.[1] ?? headerButtonClasses?.[2] ?? '').split(' ');

    expect(classes).toContain('hidden');
    expect(classes).toContain('@[760px]:inline-flex');
    expect(classes).not.toContain('inline-flex');
  });
});

describe('InvoiceBuyerSection()', () => {
  it('renders a read-only NIP input, a mounted live region and name-only options', () => {
    const contractor = Builder<Contractor>().id('contractor-1').name('Acme sp. z o.o.').nip('8951930748').addressLine1('ul. Legnicka 16').addressLine2('53-673 Wrocław').build();
    const markup = renderToStaticMarkup(
      createElement(InvoiceBuyerSection, {
        contractors: [contractor],
        contractorId: 'contractor-1',
        onContractorChange: () => undefined,
        onBuyerNipInvalid: () => undefined,
      }),
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toMatch(/<input[^>]*readOnly=""[^>]*value="8951930748"|<input[^>]*value="8951930748"[^>]*readOnly=""/);
    expect(markup).toContain('>Acme sp. z o.o.</option>');
    expect(markup).toContain('ul. Legnicka 16, 53-673 Wrocław');
    expect(markup).not.toContain('Biała lista OK');
  });

  it('shows BRAK NIP with the register hint when the contractor has no NIP', () => {
    const contractor = Builder<Contractor>().id('contractor-2').name('Private buyer').nip(null).addressLine1(null).addressLine2(null).build();
    const markup = renderToStaticMarkup(
      createElement(InvoiceBuyerSection, {
        contractors: [contractor],
        contractorId: 'contractor-2',
        onContractorChange: () => undefined,
        onBuyerNipInvalid: () => undefined,
      }),
    );

    expect(markup).toContain('Brak NIP');
    expect(markup).toContain('Uzupełnij NIP w kartotece kontrahenta.');
    expect(markup).not.toContain('Biała lista OK');
  });
});

describe('InvoiceBuyerSection() NIP input font size', () => {
  it('is 16px below md and 13px from md up', () => {
    const contractor = Builder<Contractor>().id('contractor-1').name('Acme').nip('8951930748').build();
    const markup = renderToStaticMarkup(
      createElement(InvoiceBuyerSection, {
        contractors: [contractor],
        contractorId: 'contractor-1',
        onContractorChange: () => undefined,
        onBuyerNipInvalid: () => undefined,
      }),
    );

    expect(markup).toMatch(/id="buyerNip"[^>]*class="[^"]*\btext-base\b[^"]*\bmd:text-\[13px\]/);
  });
});

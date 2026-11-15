import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Builder } from 'builder-pattern';
import { describe, expect, it } from 'vitest';
import type { InvoiceSummary } from '../../../lib/api-types';
import { InvoicesTable } from '../../../components/organisms/InvoicesTable';
import { InvoiceListPagination } from './InvoiceListPagination';
import { InvoicesFilterBar } from './InvoicesFilterBar';

describe('InvoicesFilterBar()', () => {
  it('renders a GET search form with five segments, the active one marked, and the month select', () => {
    const markup = renderToStaticMarkup(
      createElement(InvoicesFilterBar, {
        query: { search: 'ACME', issueMonth: '2026-08', segment: 'accepted', page: 3 },
        monthOptions: [{ value: '2026-08', label: 'Sierpień 2026' }],
      }),
    );

    expect(markup).toContain('role="search"');
    expect(markup).toContain('method="get"');
    expect(markup).toContain('value="ACME"');
    expect(markup).toContain('<input type="hidden" name="segment" value="accepted"/>');
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(markup).toContain('href="/dashboard/invoices?q=ACME&amp;month=2026-08&amp;segment=drafts"');
    expect(markup).toContain('href="/dashboard/invoices?q=ACME&amp;month=2026-08"');
    expect(markup).toContain('<option value="2026-08" selected="">Sierpień 2026</option>');
    expect(markup).not.toContain('invoice-filter-not-submitted');
  });

  it('shows a dismissible not-submitted indicator for the dashboard link without adding a segment', () => {
    const markup = renderToStaticMarkup(
      createElement(InvoicesFilterBar, { query: { ksefStatus: 'not_submitted', page: 1 }, monthOptions: [] }),
    );

    expect(markup).toContain('data-testid="invoice-filter-not-submitted"');
    expect(markup).toContain('aria-label="Usuń filtr: nie wysłane do KSeF"');
    expect(markup).toContain('<input type="hidden" name="ksefStatus" value="not_submitted"/>');
    expect(markup).not.toContain('aria-current="page"');
    expect(markup.match(/<nav /g)).toHaveLength(1);
  });
});

describe('InvoiceListPagination()', () => {
  it('renders a numbered window with the current page marked and filters preserved', () => {
    const markup = renderToStaticMarkup(
      createElement(InvoiceListPagination, { query: { search: 'a', page: 2 }, totalPages: 5 }),
    );

    expect(markup).toContain('aria-label="Paginacja"');
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(markup).toContain('href="/dashboard/invoices?q=a&amp;page=3"');
    expect(markup).toContain('href="/dashboard/invoices?q=a"');
  });
});

describe('InvoicesTable()', () => {
  it('renders the caption, rows with unique link names and the footer inside the card', () => {
    const invoice = Builder<InvoiceSummary>()
      .id('invoice-1')
      .invoiceNumber('FV/1')
      .status('ISSUED')
      .ksefStatus('accepted')
      .issueDate('2026-08-05')
      .totalNet('100.00')
      .totalVat('23.00')
      .totalGross('123.00')
      .contractor({ id: 'contractor-1', name: 'Acme', nip: null })
      .build();

    const markup = renderToStaticMarkup(
      createElement(InvoicesTable, { invoices: [invoice], caption: 'Faktury', footer: createElement('p', null, 'stopka') }),
    );

    expect(markup).toContain('<caption class="sr-only">Faktury</caption>');
    expect(markup).toContain('aria-label="Faktura FV/1, Acme"');
    expect(markup).toContain('aria-label="Szczegóły faktury FV/1"');
    expect(markup).toContain('stopka');
  });

  it('renders the filtered empty state below the header band', () => {
    const markup = renderToStaticMarkup(
      createElement(InvoicesTable, { invoices: [], emptyState: createElement('p', null, 'brak') }),
    );

    expect(markup).toContain('brak');
    expect(markup).not.toContain('<tbody><tr');
  });
});

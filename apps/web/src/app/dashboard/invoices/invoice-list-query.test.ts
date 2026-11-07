import { describe, expect, it } from 'vitest';
import { invoiceListApiParams, invoiceListHref, invoiceListMonthOptions, parseInvoiceListQuery } from './invoice-list-query';

describe('parseInvoiceListQuery()', () => {
  it('parses the new contract', () => {
    expect(parseInvoiceListQuery({ q: '  ACME  ', month: '2026-08', segment: 'accepted', page: '3' })).toEqual({
      search: 'ACME',
      issueMonth: '2026-08',
      segment: 'accepted',
      page: 3,
    });
  });

  it('drops invalid values', () => {
    expect(parseInvoiceListQuery({ q: '   ', month: '2026-13', segment: 'bogus', page: '-2' })).toEqual({
      search: undefined,
      issueMonth: undefined,
      segment: undefined,
      page: 1,
    });
  });

  it('caps the search at 100 characters', () => {
    expect(parseInvoiceListQuery({ q: 'a'.repeat(150) }).search).toHaveLength(100);
  });

  it('maps legacy status and ksefStatus links to a segment', () => {
    expect(parseInvoiceListQuery({ status: 'DRAFT' }).segment).toBe('drafts');
    expect(parseInvoiceListQuery({ ksefStatus: 'rejected' }).segment).toBe('rejected');
  });

  it('honours the dashboard ksefStatus=not_submitted link as a filter, not a segment', () => {
    expect(parseInvoiceListQuery({ ksefStatus: 'not_submitted' })).toEqual({ ksefStatus: 'not_submitted', page: 1 });
    expect(parseInvoiceListQuery({ ksefStatus: 'not_submitted', segment: 'drafts' }).ksefStatus).toBeUndefined();
  });
});

describe('invoiceListHref()', () => {
  const query = { search: 'a&b', issueMonth: '2026-08', segment: 'pending', page: 4 } as const;

  it('encodes values and omits empty ones', () => {
    expect(invoiceListHref({ page: 1 })).toBe('/dashboard/invoices');
    expect(invoiceListHref(query, { page: 5 })).toBe('/dashboard/invoices?q=a%26b&month=2026-08&segment=pending&page=5');
  });

  it('omits an empty month submitted by the search form', () => {
    expect(invoiceListHref({ page: 1 }, { search: 'X', issueMonth: '' })).toBe('/dashboard/invoices?q=X');
  });

  it('resets the page when a filter changes', () => {
    expect(invoiceListHref(query, { segment: 'drafts' })).toBe('/dashboard/invoices?q=a%26b&month=2026-08&segment=drafts');
  });

  it('clears a filter with undefined', () => {
    expect(invoiceListHref(query, { search: undefined, issueMonth: undefined, segment: undefined })).toBe('/dashboard/invoices');
  });
});

describe('invoiceListHref() with the not-submitted filter', () => {
  it('keeps the filter across search and pagination, clears it on dismiss and when a segment is chosen', () => {
    const query = { ksefStatus: 'not_submitted', page: 2 } as const;
    expect(invoiceListHref(query, { page: 3 })).toBe('/dashboard/invoices?ksefStatus=not_submitted&page=3');
    expect(invoiceListHref(query, { search: 'x' })).toBe('/dashboard/invoices?q=x&ksefStatus=not_submitted');
    expect(invoiceListHref(query, { ksefStatus: undefined })).toBe('/dashboard/invoices');
    expect(invoiceListHref(query, { segment: 'accepted' })).toBe('/dashboard/invoices?segment=accepted');
  });
});

describe('invoiceListMonthOptions()', () => {
  it('lists 24 months newest first and keeps an older selected month', () => {
    const options = invoiceListMonthOptions('2020-01', new Date('2026-08-15T00:00:00Z'));
    expect(options).toHaveLength(25);
    expect(options[0]).toEqual({ value: '2026-08', label: 'Sierpień 2026' });
    expect(options[23].value).toBe('2024-09');
    expect(options[24].value).toBe('2020-01');
  });
});

describe('invoiceListApiParams()', () => {
  it('maps segments to API params', () => {
    expect(invoiceListApiParams({ search: 'x', issueMonth: '2026-08', segment: 'drafts', page: 2 })).toEqual({
      page: '2',
      search: 'x',
      issueMonth: '2026-08',
      status: 'DRAFT',
    });
    expect(invoiceListApiParams({ segment: 'accepted', page: 1 })).toEqual({ page: '1', ksefStatus: 'accepted' });
    expect(invoiceListApiParams({ ksefStatus: 'not_submitted', page: 1 })).toEqual({ page: '1', ksefStatus: 'not_submitted' });
  });
});

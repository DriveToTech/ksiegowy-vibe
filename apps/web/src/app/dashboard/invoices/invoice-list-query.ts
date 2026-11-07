import { t } from '../../../lib/translations';

export const invoiceListSegments = [
  { segment: 'accepted', label: t.outgoingInvoices.filters.accepted, apiParams: { ksefStatus: 'accepted' } },
  { segment: 'pending', label: t.outgoingInvoices.filters.pending, apiParams: { ksefStatus: 'pending' } },
  { segment: 'rejected', label: t.outgoingInvoices.filters.rejected, apiParams: { ksefStatus: 'rejected' } },
  { segment: 'drafts', label: t.outgoingInvoices.filters.drafts, apiParams: { status: 'DRAFT' } },
] as const;

export type InvoiceListSegment = (typeof invoiceListSegments)[number]['segment'];

export interface InvoiceListQuery {
  search?: string;
  issueMonth?: string;
  segment?: InvoiceListSegment;
  // Dashboard deep link (?ksefStatus=not_submitted). A filter, not a segment tab; a segment replaces it.
  ksefStatus?: 'not_submitted';
  page: number;
}

type SearchParamsInput = Record<string, string | string[] | undefined>;

const maximumSearchLength = 100;
const issueMonthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const legacyKsefStatusToSegment: Record<string, InvoiceListSegment> = {
  accepted: 'accepted',
  pending: 'pending',
  rejected: 'rejected',
};

export function parseInvoiceListQuery(searchParams: SearchParamsInput): InvoiceListQuery {
  const first = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const search = first('q')?.trim().slice(0, maximumSearchLength) || undefined;
  const month = first('month');
  const issueMonth = month && issueMonthPattern.test(month) ? month : undefined;

  const requestedSegment = first('segment');
  const segment =
    invoiceListSegments.find((candidate) => candidate.segment === requestedSegment)?.segment ??
    (first('status') === 'DRAFT' ? 'drafts' : undefined) ??
    legacyKsefStatusToSegment[first('ksefStatus') ?? ''];

  const ksefStatus = !segment && first('ksefStatus') === 'not_submitted' ? 'not_submitted' : undefined;

  const pageNumber = Number(first('page'));
  const page = Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : 1;

  return { search, issueMonth, segment, ksefStatus, page };
}

// Changing search, month or segment resets the page unless the change sets the page explicitly.
export function invoiceListHref(query: InvoiceListQuery, change: Partial<InvoiceListQuery> = {}): string {
  const next = {
    ...query,
    ...change,
    ...('page' in change ? {} : { page: 1 }),
    ...(change.segment ? { ksefStatus: undefined } : {}),
  };
  const params = new URLSearchParams();
  if (next.search) params.set('q', next.search);
  if (next.issueMonth) params.set('month', next.issueMonth);
  if (next.segment) params.set('segment', next.segment);
  if (next.ksefStatus) params.set('ksefStatus', next.ksefStatus);
  if (next.page > 1) params.set('page', String(next.page));
  const queryString = params.toString();
  return queryString ? `/dashboard/invoices?${queryString}` : '/dashboard/invoices';
}

export function invoiceListApiParams(query: InvoiceListQuery): Record<string, string> {
  const segmentParams = invoiceListSegments.find((candidate) => candidate.segment === query.segment)?.apiParams;
  return {
    page: String(query.page),
    ...(query.search ? { search: query.search } : {}),
    ...(query.issueMonth ? { issueMonth: query.issueMonth } : {}),
    ...(query.ksefStatus ? { ksefStatus: query.ksefStatus } : {}),
    ...segmentParams,
  };
}

const monthOptionCount = 24;

// The last 24 months (newest first), plus the selected month when it is older, so the select never loses the active value.
export function invoiceListMonthOptions(selectedMonth?: string, now = new Date()): Array<{ value: string; label: string }> {
  const months = Array.from({ length: monthOptionCount }, (_, offset) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1)).toISOString().slice(0, 7),
  );
  if (selectedMonth && !months.includes(selectedMonth)) months.push(selectedMonth);
  return months
    .sort()
    .reverse()
    .map((value) => {
      const label = new Date(`${value}-01T00:00:00Z`).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
    });
}

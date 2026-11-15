'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { t } from '../../../lib/translations';
import { invoiceListHref, invoiceListSegments, type InvoiceListQuery } from './invoice-list-query';

interface InvoicesFilterBarProps {
  query: InvoiceListQuery;
  monthOptions: Array<{ value: string; label: string }>;
}

const segmentLinkClassName =
  'inline-flex min-h-11 shrink-0 snap-start items-center rounded-chip px-[13px] py-[7px] text-[12.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

// Native GET form: Enter in the search field submits (no live search); the month select submits on change.
export function InvoicesFilterBar({ query, monthOptions }: InvoicesFilterBarProps) {
  const segments = [{ segment: undefined, label: t.outgoingInvoices.filters.all }, ...invoiceListSegments];

  // Native submit serializes empty fields; disabling them first keeps `month=` out of the URL.
  const omitEmptyFields = (event: FormEvent<HTMLFormElement>) => {
    for (const field of event.currentTarget.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[name], select[name]')) {
      if (!field.value) field.disabled = true;
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <form
        onSubmit={omitEmptyFields}
        method="get"
        action="/dashboard/invoices"
        role="search"
        className="flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center"
      >
        {query.segment ? <input type="hidden" name="segment" value={query.segment} /> : null}
        {query.ksefStatus ? <input type="hidden" name="ksefStatus" value={query.ksefStatus} /> : null}

        <label htmlFor="invoice-search" className="sr-only">
          {t.outgoingInvoices.searchLabel}
        </label>
        <input
          id="invoice-search"
          data-testid="invoice-search"
          type="search"
          name="q"
          defaultValue={query.search ?? ''}
          maxLength={100}
          enterKeyHint="search"
          autoComplete="off"
          placeholder={t.outgoingInvoices.searchPlaceholder}
          className="h-12 w-full min-w-0 rounded-control border border-outline-control bg-surface-raised px-[13px] text-base text-foreground transition placeholder:text-muted focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:h-11 lg:flex-1 lg:text-[13px]"
        />

        <nav
          aria-label={t.outgoingInvoices.statusFilterLabel}
          className="flex gap-0.5 overflow-x-auto rounded-control border border-outline bg-surface-raised p-[3px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {segments.map(({ segment, label }) => {
            const isActive = segment === query.segment && !(segment === undefined && query.ksefStatus);
            return (
              <Link
                key={label}
                href={invoiceListHref(query, { segment })}
                aria-current={isActive ? 'page' : undefined}
                className={`${segmentLinkClassName} ${isActive ? 'bg-foreground/10 font-medium text-foreground' : 'text-muted transition hover:text-foreground-secondary'}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <label htmlFor="invoice-month" className="sr-only">
          {t.outgoingInvoices.periodLabel}
        </label>
        <select
          id="invoice-month"
          data-testid="invoice-month"
          name="month"
          defaultValue={query.issueMonth ?? ''}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="h-12 w-full rounded-control border border-outline-control bg-secondary-surface px-[13px] text-base font-medium text-foreground transition focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:h-11 lg:w-auto lg:text-[12.5px]"
        >
          <option value="">{t.outgoingInvoices.periodAll}</option>
          {monthOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </form>

      {query.ksefStatus ? (
        <div className="flex">
          <Link
            href={invoiceListHref(query, { ksefStatus: undefined })}
            aria-label={t.outgoingInvoices.clearNotSubmittedFilter}
            data-testid="invoice-filter-not-submitted"
            className="inline-flex min-h-11 items-center gap-2 rounded-control border border-outline bg-secondary-surface px-[13px] text-[12.5px] font-medium text-foreground transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {t.outgoingInvoices.notSubmittedFilter}
            <span aria-hidden="true">×</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

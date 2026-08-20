'use client';

import { RouteErrorState } from '../../../components/templates/RouteErrorState';
import { t } from '../../../lib/translations';

export default function InvoicesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorState
      title={t.outgoingInvoices.routeErrorTitle}
      error={error}
      reset={reset}
      backHref="/dashboard/invoices"
      backLabel={t.outgoingInvoices.routeErrorBackLabel}
    />
  );
}

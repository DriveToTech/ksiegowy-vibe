import { t } from '../../../lib/translations';

export function InvoiceDraftFormSkeleton() {
  const block = 'animate-pulse rounded-card bg-surface-panel motion-reduce:animate-none';
  return (
    <div data-invoice-focus-layout className="@container space-y-6" aria-busy="true">
      <span className="sr-only" role="status">{t.outgoingInvoices.loadingLabel}</span>
      <div className="space-y-3">
        <div className={`${block} h-4 w-40`} />
        <div className={`${block} h-11 w-72`} />
      </div>
      <div className="grid gap-6 @[1100px]:grid-cols-[minmax(0,1fr)_372px] @[1100px]:items-start">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className={`${block} h-40`} />
            <div className={`${block} h-40`} />
          </div>
          <div className={`${block} h-72`} />
          <div className={`${block} h-40`} />
        </div>
        <div className="space-y-4">
          <div className={`${block} h-56`} />
          <div className={`${block} h-12`} />
        </div>
      </div>
    </div>
  );
}

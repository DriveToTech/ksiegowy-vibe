import { t } from '../../../lib/translations';

export default function InvoicesLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only" role="status">{t.outgoingInvoices.loadingLabel}</span>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="h-4 w-40 animate-pulse rounded-full bg-surface-panel motion-reduce:animate-none" />
          <div className="h-11 w-72 animate-pulse rounded-full bg-surface-panel motion-reduce:animate-none" />
        </div>
        <div className="h-11 w-44 animate-pulse rounded-full bg-surface-panel motion-reduce:animate-none lg:mt-6" />
      </div>
      <div className="h-11 w-full animate-pulse rounded-control bg-surface-panel motion-reduce:animate-none" />
      <div className="space-y-2 rounded-card bg-surface-panel p-4">
        {Array.from({ length: 8 }, (_, rowIndex) => (
          <div key={rowIndex} className="h-11 animate-pulse rounded-control bg-surface-raised motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}

export default function InvoicesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="h-4 w-40 animate-pulse rounded-full bg-surface-panel" />
          <div className="h-11 w-72 animate-pulse rounded-full bg-surface-panel" />
          <div className="h-6 w-96 max-w-full animate-pulse rounded-full bg-surface-panel" />
        </div>
        <div className="h-11 w-44 animate-pulse rounded-full bg-surface-panel lg:mt-6" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="h-32 animate-pulse rounded-card bg-surface-panel" />
        <div className="h-32 animate-pulse rounded-card bg-surface-panel" />
        <div className="h-32 animate-pulse rounded-card bg-surface-panel" />
      </div>
      <div className="h-96 animate-pulse rounded-card bg-surface-panel" />
    </div>
  );
}

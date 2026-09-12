export default function IncomingLoading() {
  return (
    <div aria-busy="true" aria-label="Ładowanie faktur przychodzących" className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="h-4 w-32 animate-pulse rounded-full bg-surface-panel" />
          <div className="h-11 w-72 animate-pulse rounded-full bg-surface-panel" />
          <div className="h-6 w-[30rem] max-w-full animate-pulse rounded-full bg-surface-panel" />
        </div>
        <div className="h-11 w-52 animate-pulse rounded-full bg-surface-panel" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-28 animate-pulse rounded-card bg-surface-panel" />
        <div className="h-28 animate-pulse rounded-card bg-surface-panel" />
        <div className="h-28 animate-pulse rounded-card bg-surface-panel" />
      </div>
      <div className="h-96 animate-pulse rounded-card bg-surface-panel" />
    </div>
  );
}

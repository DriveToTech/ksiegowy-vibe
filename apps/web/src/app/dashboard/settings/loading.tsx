export default function SettingsLoading() {
  return (
    <div aria-busy="true" aria-label="Ładowanie ustawień" className="space-y-6">
      <div className="space-y-3">
        <div className="h-4 w-32 animate-pulse rounded-full bg-surface-panel" />
        <div className="h-11 w-48 animate-pulse rounded-full bg-surface-panel" />
        <div className="h-6 w-[30rem] max-w-full animate-pulse rounded-full bg-surface-panel" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-24 animate-pulse rounded-card bg-surface-panel" />
        <div className="h-24 animate-pulse rounded-card bg-surface-panel" />
        <div className="h-24 animate-pulse rounded-card bg-surface-panel" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <div className="h-56 animate-pulse rounded-card bg-surface-panel" />
        <div className="h-[32rem] animate-pulse rounded-card bg-surface-panel" />
      </div>
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-card bg-surface-panel" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="h-40 animate-pulse rounded-card bg-surface-panel" />
        <div className="h-40 animate-pulse rounded-card bg-surface-panel" />
        <div className="h-40 animate-pulse rounded-card bg-surface-panel" />
      </div>
      <div className="space-y-4">
        <div className="h-80 animate-pulse rounded-card bg-surface-panel" />
        <div className="h-28 animate-pulse rounded-card bg-surface-panel" />
      </div>
    </div>
  );
}

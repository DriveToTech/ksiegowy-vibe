export default function HouseholdLoading() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-card bg-surface-panel" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="h-32 animate-pulse rounded-card bg-surface-panel" />
        <div className="h-32 animate-pulse rounded-card bg-surface-panel" />
        <div className="h-32 animate-pulse rounded-card bg-surface-panel" />
        <div className="h-32 animate-pulse rounded-card bg-surface-panel" />
      </div>
      <div className="h-80 animate-pulse rounded-card bg-surface-panel" />
    </div>
  );
}

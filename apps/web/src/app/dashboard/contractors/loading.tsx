export default function ContractorsLoading() {
  return (
    <div aria-busy="true" aria-label="Ładowanie kontrahentów" className="space-y-6">
      <div className="space-y-3">
        <div className="h-4 w-32 animate-pulse rounded-full bg-surface-panel" />
        <div className="h-11 w-56 animate-pulse rounded-full bg-surface-panel" />
        <div className="h-6 w-[30rem] max-w-full animate-pulse rounded-full bg-surface-panel" />
      </div>
      <div className="h-12 animate-pulse rounded-card bg-surface-panel" />
      <div className="h-[32rem] animate-pulse rounded-card bg-surface-panel" />
    </div>
  );
}

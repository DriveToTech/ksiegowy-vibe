export interface ClearanceStep {
  label: string;
  meta: string;
  state: 'done' | 'error' | 'pending';
}

const railClasses: Record<ClearanceStep['state'], string> = {
  done: 'bg-success-ink',
  error: 'bg-error-ink',
  pending: 'bg-foreground/15',
};

const labelClasses: Record<ClearanceStep['state'], string> = {
  done: 'text-foreground',
  error: 'text-error-ink',
  pending: 'text-muted',
};

export function ClearanceStepper({ steps }: { steps: ClearanceStep[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {steps.map((step) => (
        <div key={step.label} className="flex flex-col gap-2">
          <div className={`h-[3px] rounded-full ${railClasses[step.state]}`} />
          <p className={`text-sm font-medium ${labelClasses[step.state]}`}>{step.label}</p>
          <p className="font-mono text-[11px] text-muted">{step.meta}</p>
        </div>
      ))}
    </div>
  );
}

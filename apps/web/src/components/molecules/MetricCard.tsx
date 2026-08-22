import type { ReactNode } from 'react';
import { Surface } from '../atoms/Surface';
import { cn } from '../../lib/cn';

interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
  accent?: 'default' | 'primary' | 'warning';
  icon?: ReactNode;
  className?: string;
}

const accentClasses: Record<NonNullable<MetricCardProps['accent']>, string> = {
  default: 'text-foreground',
  primary: 'text-primary-strong',
  warning: 'text-warning-ink',
};

export function MetricCard({
  label,
  value,
  hint,
  accent = 'default',
  icon,
  className,
}: MetricCardProps) {
  return (
    <Surface className={cn('p-5', className)} tone="panel">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">{label}</p>
          <p className={cn('text-3xl font-semibold tracking-tight', accentClasses[accent])}>
            {value}
          </p>
          {hint ? <p className="text-sm text-muted">{hint}</p> : null}
        </div>
        {icon ? (
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-panel/80 text-primary-strong backdrop-blur-xl">
            {icon}
          </div>
        ) : null}
      </div>
    </Surface>
  );
}

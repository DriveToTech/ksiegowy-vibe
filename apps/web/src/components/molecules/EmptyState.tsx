import type { ReactNode } from 'react';
import { Surface } from '../atoms/Surface';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Surface tone="glass" shape="organic" className="p-8 text-center sm:p-10">
      <div className="mx-auto max-w-xl space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="text-sm text-muted sm:text-base">{description}</p>
        {action ? <div className="flex justify-center pt-3">{action}</div> : null}
      </div>
    </Surface>
  );
}

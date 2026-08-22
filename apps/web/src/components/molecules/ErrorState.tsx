import type { ReactNode } from 'react';
import { Surface } from '../atoms/Surface';

interface ErrorStateProps {
  title?: string;
  message: string;
  action?: ReactNode;
}

export function ErrorState({ title = 'Wystąpił problem', message, action }: ErrorStateProps) {
  return (
    <Surface className="border-error bg-error p-5 sm:p-6" role="alert" aria-live="assertive">
      <div className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight text-error-ink">{title}</h2>
        <p className="text-sm text-error-ink sm:text-base">{message}</p>
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </Surface>
  );
}

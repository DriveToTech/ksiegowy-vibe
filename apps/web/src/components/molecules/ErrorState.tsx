import type { ReactNode } from 'react';
import { Banner } from './Banner';

interface ErrorStateProps {
  title?: string;
  message: string;
  action?: ReactNode;
}

export function ErrorState({ title = 'Wystąpił problem', message, action }: ErrorStateProps) {
  return (
    <Banner tone="error" className="p-5 sm:p-6" aria-live="assertive">
      <div className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight text-error-ink">{title}</h2>
        <p className="text-sm text-error-ink sm:text-base">{message}</p>
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </Banner>
  );
}

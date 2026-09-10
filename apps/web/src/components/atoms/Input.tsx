import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-12 w-full rounded-control border border-outline-control bg-surface-raised px-3 text-base text-foreground transition placeholder:text-muted focus:border-primary aria-invalid:border-error-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:border-outline disabled:bg-surface-muted disabled:text-foreground-disabled disabled:opacity-100',
        className,
      )}
      {...props}
    />
  );
}

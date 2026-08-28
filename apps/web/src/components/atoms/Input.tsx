import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export function Input({ className, lang = 'pl', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      lang={lang}
      className={cn(
        'h-11 w-full rounded-control border border-outline-control bg-surface-raised px-3 text-sm text-foreground transition placeholder:text-muted focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

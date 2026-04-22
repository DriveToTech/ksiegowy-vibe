import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-[1rem] border border-outline/40 bg-surface-raised/65 px-3 text-sm text-foreground outline-none backdrop-blur-xl transition placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-primary/15 focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

import type { TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-28 w-full rounded-[1.25rem] border border-outline bg-surface-raised/65 px-3 py-3 text-sm text-foreground backdrop-blur-xl transition placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-primary/15 focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

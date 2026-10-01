import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type BadgeTone = 'draft' | 'offline24' | 'primary' | 'success' | 'warning' | 'danger';

const toneClasses: Record<BadgeTone, string> = {
  draft: 'bg-draft text-draft-ink',
  offline24: 'bg-neutral-status text-neutral-status-ink',
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success text-success-ink',
  warning: 'bg-warning text-warning-ink',
  danger: 'bg-error text-error-ink',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  tone?: BadgeTone;
  // `tag` is the compact uppercase status tag used by the advisor; `default` keeps the touch-sized chip.
  variant?: 'default' | 'tag';
}

export function Badge({ children, className, tone = 'draft', variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-chip font-mono text-[10px] tracking-[0.08em]',
        variant === 'tag' ? 'px-2 py-1 uppercase' : 'min-h-7 px-3',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

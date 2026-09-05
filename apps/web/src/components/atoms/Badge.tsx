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
}

export function Badge({ children, className, tone = 'draft', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-h-7 items-center whitespace-nowrap rounded-chip px-3 font-mono text-[10px] tracking-[0.08em]',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted/85 text-foreground backdrop-blur-xl',
  primary: 'bg-primary-soft/95 text-primary backdrop-blur-xl',
  success: 'bg-success/85 text-success-ink backdrop-blur-xl',
  warning: 'bg-warning/85 text-warning-ink backdrop-blur-xl',
  danger: 'bg-error-soft/90 text-error-ink backdrop-blur-xl',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  tone?: BadgeTone;
}

export function Badge({ children, className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-h-7 items-center whitespace-nowrap rounded-full px-3 text-xs font-semibold tracking-[0.01em]',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

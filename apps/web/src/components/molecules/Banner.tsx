import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type BannerTone = 'error' | 'success' | 'warning' | 'info';

interface BannerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  children: ReactNode;
  tone: BannerTone;
  role?: 'alert' | 'status';
}

const toneClasses: Record<BannerTone, string> = {
  error: 'border-error-ink/30 bg-error',
  success: 'border-success-ink/30 bg-success',
  warning: 'border-warning-ink/30 bg-warning',
  info: 'border-neutral-status-ink/30 bg-neutral-status',
};

const defaultRole: Record<BannerTone, 'alert' | 'status'> = {
  error: 'alert',
  warning: 'alert',
  success: 'status',
  info: 'status',
};

export function Banner({ children, className, tone, role, ...props }: BannerProps) {
  return (
    <div
      role={role ?? defaultRole[tone]}
      className={cn('rounded-inset border px-4 py-3 text-sm text-foreground-secondary', toneClasses[tone], className)}
      {...props}
    >
      {children}
    </div>
  );
}

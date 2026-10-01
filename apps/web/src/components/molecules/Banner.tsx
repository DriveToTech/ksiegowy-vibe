import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type BannerTone = 'error' | 'success' | 'warning' | 'info';

interface BannerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  children: ReactNode;
  tone: BannerTone;
  role?: 'alert' | 'status';
  // `accent` is a raised card with a 3px tone-coloured left border instead of a tone-filled box.
  variant?: 'fill' | 'accent';
}

const toneClasses: Record<BannerTone, string> = {
  error: 'border-error-ink/30 bg-error',
  success: 'border-success-ink/30 bg-success',
  warning: 'border-warning-ink/30 bg-warning',
  info: 'border-neutral-status-ink/30 bg-neutral-status',
};

const accentClasses: Record<BannerTone, string> = {
  error: 'border-l-error-ink',
  success: 'border-l-success-ink',
  warning: 'border-l-warning-ink',
  info: 'border-l-primary',
};

const defaultRole: Record<BannerTone, 'alert' | 'status'> = {
  error: 'alert',
  warning: 'alert',
  success: 'status',
  info: 'status',
};

export function Banner({ children, className, tone, role, variant = 'fill', ...props }: BannerProps) {
  return (
    <div
      role={role ?? defaultRole[tone]}
      className={cn(
        'rounded-inset border px-4 py-3 text-sm text-foreground-secondary',
        variant === 'accent' ? cn('border-outline border-l-[3px] bg-surface-raised', accentClasses[tone]) : toneClasses[tone],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

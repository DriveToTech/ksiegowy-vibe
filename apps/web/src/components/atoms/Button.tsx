import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'rounded-full bg-gradient-to-br from-primary via-primary-strong to-cyan-300 text-primary-ink shadow-[var(--shadow-aura)] hover:brightness-105 focus-visible:outline-primary disabled:brightness-100 disabled:opacity-60',
  secondary:
    'rounded-full bg-surface-panel/70 text-secondary-ink backdrop-blur-xl hover:bg-surface-raised/80 focus-visible:outline-secondary-ink disabled:opacity-60',
  ghost:
    'rounded-full bg-transparent text-foreground hover:bg-surface-panel/70 focus-visible:outline-primary disabled:opacity-60',
  danger:
    'rounded-full bg-error text-foreground shadow-[var(--shadow-aura)] hover:brightness-105 focus-visible:outline-error disabled:opacity-60',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  children,
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

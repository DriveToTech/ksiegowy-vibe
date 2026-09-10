import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '../../lib/cn';

type ButtonVariant = 'primary' | 'primaryQuiet' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'rounded-control bg-[image:var(--primary-gradient)] text-primary-ink hover:brightness-105 focus-visible:outline-primary disabled:brightness-100',
  primaryQuiet:
    'rounded-control bg-primary text-primary-ink hover:brightness-105 focus-visible:outline-primary disabled:brightness-100',
  secondary:
    'rounded-control bg-secondary-surface text-secondary-ink hover:bg-surface-raised focus-visible:outline-secondary-ink',
  ghost:
    'rounded-control bg-transparent text-primary hover:bg-secondary-surface focus-visible:outline-primary',
  danger:
    'rounded-control bg-error text-error-ink hover:brightness-105 focus-visible:outline-error',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-[17px] text-sm',
  lg: 'h-[46px] px-[19px] text-base',
};

interface ButtonStyleProps {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

type ButtonProps = ButtonStyleProps &
  (
    | (Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonStyleProps | 'href'> & { href?: never })
    | (Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonStyleProps | 'href'> & { href: string; disabled?: boolean })
  );

export function Button(props: ButtonProps) {
  const { children, className, variant = 'primary', size = 'md', loading = false, ...elementProps } = props;
  const isDisabled = loading || elementProps.disabled === true;
  const buttonClassName = cn(
    'inline-flex min-h-11 items-center justify-center font-semibold transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-foreground-disabled disabled:opacity-100 aria-disabled:cursor-not-allowed aria-disabled:bg-surface-raised aria-disabled:text-foreground-disabled aria-disabled:opacity-100',
    variantClasses[variant],
    sizeClasses[size],
    className,
  );

  if ('href' in elementProps && typeof elementProps.href === 'string') {
    const { href, disabled: _disabled, ...linkProps } = elementProps;

    return (
      <Link
        {...linkProps}
        href={href}
        aria-disabled={isDisabled || undefined}
        aria-busy={loading || undefined}
        tabIndex={isDisabled ? -1 : linkProps.tabIndex}
        className={cn(buttonClassName, isDisabled && 'pointer-events-none')}
        onClick={isDisabled ? (event) => event.preventDefault() : linkProps.onClick}
      >
        {children}
      </Link>
    );
  }

  const { type = 'button', ...buttonProps } = elementProps;

  return (
    <button
      type={type}
      {...buttonProps}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || undefined}
      className={buttonClassName}
    >
      {children}
    </button>
  );
}

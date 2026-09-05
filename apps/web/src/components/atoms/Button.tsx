import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '../../lib/cn';

type ButtonVariant = 'primary' | 'primaryQuiet' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'rounded-control bg-[image:var(--primary-gradient)] text-primary-ink hover:brightness-105 focus-visible:outline-primary disabled:brightness-100 disabled:opacity-60',
  primaryQuiet:
    'rounded-control bg-primary text-primary-ink hover:brightness-105 focus-visible:outline-primary disabled:brightness-100 disabled:opacity-60',
  secondary:
    'rounded-control bg-secondary-surface text-secondary-ink hover:bg-surface-raised focus-visible:outline-secondary-ink disabled:opacity-60',
  ghost:
    'rounded-control bg-transparent text-primary hover:bg-secondary-surface focus-visible:outline-primary disabled:opacity-60',
  danger:
    'rounded-control bg-error text-error-ink hover:brightness-105 focus-visible:outline-error disabled:opacity-60',
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
}

type ButtonProps = ButtonStyleProps &
  (
    | (Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonStyleProps | 'href'> & { href?: never })
    | (Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonStyleProps | 'href'> & { href: string; disabled?: boolean })
  );

export function Button(props: ButtonProps) {
  const { children, className, variant = 'primary', size = 'md', ...elementProps } = props;
  const buttonClassName = cn(
    'inline-flex items-center justify-center font-semibold transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed',
    variantClasses[variant],
    sizeClasses[size],
    className,
  );

  if ('href' in elementProps && typeof elementProps.href === 'string') {
    const { href, disabled, ...linkProps } = elementProps;

    return (
      <Link
        {...linkProps}
        href={href}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : linkProps.tabIndex}
        className={cn(buttonClassName, disabled && 'pointer-events-none opacity-60')}
        onClick={disabled ? (event) => event.preventDefault() : linkProps.onClick}
      >
        {children}
      </Link>
    );
  }

  const { type = 'button', ...buttonProps } = elementProps;

  return (
    <button type={type} {...buttonProps} className={buttonClassName}>
      {children}
    </button>
  );
}

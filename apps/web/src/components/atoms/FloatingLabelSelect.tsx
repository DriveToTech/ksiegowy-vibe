import type { SelectHTMLAttributes } from 'react';
import { useId } from 'react';
import { cn } from '../../lib/cn';

interface FloatingLabelSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: React.ReactNode;
}

export function FloatingLabelSelect({
  label,
  id,
  className,
  children,
  ...props
}: FloatingLabelSelectProps) {
  const generatedId = useId();
  const selectId = id ?? `floating-label-select-${generatedId}`;

  return (
    <div className="relative">
      <select
        id={selectId}
        className={cn(
          'h-14 w-full appearance-none rounded-control border border-outline-control bg-surface-raised px-3 pb-1.5 pt-5 pr-8 text-base font-medium text-foreground outline-none transition aria-invalid:border-error-ink',
          'focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          'disabled:cursor-not-allowed disabled:border-outline disabled:bg-surface-muted disabled:text-foreground-disabled disabled:opacity-100',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <label
        htmlFor={selectId}
        className="pointer-events-none absolute left-3 top-2 whitespace-nowrap text-xs text-muted"
      >
        {label}
      </label>
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </div>
  );
}

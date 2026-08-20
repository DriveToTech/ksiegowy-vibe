import type { SelectHTMLAttributes } from 'react';
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
  return (
    <div className="relative">
      <select
        id={id}
        className={cn(
          'h-14 w-full appearance-none rounded-[1rem] border border-outline bg-surface-raised/65 px-3 pb-1.5 pt-5 pr-8 text-sm font-medium text-foreground outline-none backdrop-blur-xl transition',
          'focus:border-primary focus:ring-4 focus:ring-primary/15 focus-visible:ring-4 focus-visible:ring-primary/15',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <label
        htmlFor={id}
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

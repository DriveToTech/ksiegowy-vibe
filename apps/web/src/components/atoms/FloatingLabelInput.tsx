import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';
import { cn } from '../../lib/cn';

interface FloatingLabelInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function FloatingLabelInput({ label, id, className, ...props }: FloatingLabelInputProps) {
  const generatedId = useId();
  const inputId = id ?? `floating-label-input-${generatedId}`;

  return (
    <div className="relative">
      <input
        id={inputId}
        placeholder=" "
        className={cn(
          'peer h-14 w-full rounded-control border border-outline-control bg-surface-raised px-3 pb-1.5 pt-5 text-base text-foreground outline-none transition aria-invalid:border-error-ink',
          'placeholder-transparent focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          'disabled:cursor-not-allowed disabled:border-outline disabled:bg-surface-muted disabled:text-foreground-disabled disabled:opacity-100',
          className,
        )}
        {...props}
      />
      <label
        htmlFor={inputId}
        className="pointer-events-none absolute left-3 top-2 whitespace-nowrap text-xs text-muted transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-xs"
      >
        {label}
      </label>
    </div>
  );
}

import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface FloatingLabelInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function FloatingLabelInput({ label, id, className, ...props }: FloatingLabelInputProps) {
  return (
    <div className="relative">
      <input
        id={id}
        placeholder=" "
        className={cn(
          'peer h-14 w-full rounded-[1rem] border border-outline bg-surface-raised/65 px-3 pb-1.5 pt-5 text-sm text-foreground outline-none backdrop-blur-xl transition',
          'placeholder-transparent focus:border-primary focus:ring-4 focus:ring-primary/15 focus-visible:ring-4 focus-visible:ring-primary/15',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...props}
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-3 top-2 whitespace-nowrap text-xs text-muted transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-xs"
      >
        {label}
      </label>
    </div>
  );
}

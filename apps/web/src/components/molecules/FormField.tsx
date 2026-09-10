import { cloneElement, isValidElement, useId, type AriaAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

type FormControlProps = {
  id?: string;
  'aria-describedby'?: string;
} & Pick<AriaAttributes, 'aria-invalid'>;

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  children,
  className,
}: FormFieldProps) {
  const generatedId = useId();
  const childControl = isValidElement<FormControlProps>(children) ? children : null;
  const fieldId = childControl?.props.id ?? htmlFor ?? `form-field-${generatedId}`;
  const hintId = hint ? `${fieldId}-hint` : null;
  const errorId = error ? `${fieldId}-error` : null;
  const describedBy = [childControl?.props['aria-describedby'], hintId, errorId]
    .filter((value): value is string => value != null && value.length > 0)
    .join(' ') || undefined;
  const control = childControl
    ? cloneElement(childControl, {
        id: fieldId,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : childControl.props['aria-invalid'] ?? false,
      })
    : children;

  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor={fieldId} className="block text-sm font-semibold text-foreground">
        {label}
        {required ? ' *' : ''}
      </label>
      {control}
      {hint ? <p id={hintId ?? undefined} className="text-sm text-muted">{hint}</p> : null}
      {error ? <p id={errorId ?? undefined} className="text-sm text-error-ink" role="alert">{error}</p> : null}
    </div>
  );
}

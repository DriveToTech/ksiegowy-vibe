import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Always associates the label with its control. Callers that already pass an
 * explicit htmlFor keep managing the matching id themselves (unchanged).
 * Callers that don't get a generated id wired onto their single child
 * element automatically, as long as that child doesn't already carry its
 * own id — this is what was missing before and left the label unassociated.
 */
export function FormField({
  label,
  htmlFor,
  hint,
  required = false,
  children,
  className,
}: FormFieldProps) {
  const generatedId = useId();
  const resolvedFor = htmlFor ?? generatedId;

  const childElement = !htmlFor && isValidElement(children)
    ? (children as ReactElement<{ id?: string }>)
    : null;
  const content = childElement && !childElement.props.id
    ? cloneElement(childElement, { id: resolvedFor })
    : children;

  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor={resolvedFor} className="block text-sm font-semibold text-foreground">
        {label}
        {required ? ' *' : ''}
      </label>
      {content}
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

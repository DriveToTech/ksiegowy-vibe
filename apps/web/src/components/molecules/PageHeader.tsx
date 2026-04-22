import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between', className)}>
      <div className="space-y-3 lg:max-w-3xl">
        {eyebrow ? (
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
        ) : null}
        <div className="space-y-2 lg:pl-8">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:max-w-[14ch]">
            {title}
          </h1>
          {description ? <p className="max-w-2xl text-sm text-muted sm:text-base lg:ml-10">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-3 lg:justify-end lg:pt-6">{actions}</div> : null}
    </div>
  );
}

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
    <header className={cn('flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between', className)}>
      <div className="min-w-0 flex-1 space-y-2 lg:max-w-3xl">
        <div className="flex flex-col gap-1">
          {eyebrow ? (
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">{eyebrow}</p>
          ) : null}
          <h1 className="text-[25px] font-semibold tracking-[-0.02em] text-foreground">
            {title}
          </h1>
        </div>
        {description ? <p className="max-w-2xl text-sm text-muted sm:text-base">{description}</p> : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap gap-3 sm:w-auto sm:shrink-0 sm:justify-end">{actions}</div> : null}
    </header>
  );
}

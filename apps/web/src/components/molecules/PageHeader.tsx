import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
  eyebrowHref?: string;
  hideTitle?: boolean;
  className?: string;
}

/**
 * `hideTitle` + `eyebrowHref` support detail pages whose card already
 * carries the record name as its own <h1> — the page-level title would
 * otherwise render it twice, so this drops the h1 here and turns the
 * eyebrow into a breadcrumb back to the list instead.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  eyebrowHref,
  hideTitle = false,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between', className)}>
      <div className="min-w-0 flex-1 space-y-2 lg:max-w-3xl">
        <div className="flex flex-col gap-1">
          {eyebrow ? (
            eyebrowHref ? (
              <Link href={eyebrowHref} className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted transition hover:text-foreground-secondary">
                ← {eyebrow}
              </Link>
            ) : (
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">{eyebrow}</p>
            )
          ) : null}
          {hideTitle ? null : (
            <h1 className="text-[25px] font-semibold tracking-[-0.02em] text-foreground">
              {title}
            </h1>
          )}
        </div>
        {description ? <p className="max-w-2xl text-sm text-muted sm:text-base">{description}</p> : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap gap-3 sm:w-auto sm:shrink-0 sm:justify-end">{actions}</div> : null}
    </header>
  );
}

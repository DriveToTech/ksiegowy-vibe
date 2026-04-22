import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface PublicPageLayoutProps {
  children: ReactNode;
  className?: string;
}

export function PublicPageLayout({ children, className }: PublicPageLayoutProps) {
  return (
    <main className={cn('mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12', className)}>
      {children}
    </main>
  );
}

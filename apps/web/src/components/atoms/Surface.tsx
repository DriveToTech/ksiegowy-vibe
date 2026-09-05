import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tone?: 'canvas' | 'chrome' | 'panel' | 'inset';
}

const toneClasses: Record<NonNullable<SurfaceProps['tone']>, string> = {
  canvas: 'bg-canvas',
  chrome: 'bg-chrome',
  panel: 'bg-surface-panel',
  inset: 'bg-surface-raised',
};

export function Surface({
  children,
  className,
  tone = 'panel',
  ...props
}: SurfaceProps) {
  return (
    <div
      className={cn('rounded-card border border-outline', toneClasses[tone], className)}
      {...props}
    >
      {children}
    </div>
  );
}

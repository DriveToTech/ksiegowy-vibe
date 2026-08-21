import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tone?: 'base' | 'muted' | 'raised' | 'glass';
  shape?: 'default' | 'organic' | 'pill';
}

const toneClasses: Record<NonNullable<SurfaceProps['tone']>, string> = {
  base: 'bg-surface',
  muted: 'bg-surface-muted',
  raised: 'bg-surface-raised shadow-soft',
  glass: 'bg-surface-panel/95 shadow-soft',
};

const shapeClasses: Record<NonNullable<SurfaceProps['shape']>, string> = {
  default: 'rounded-[1.75rem]',
  organic: 'rounded-[2.5rem_1.5rem_2rem_1.25rem]',
  pill: 'rounded-full',
};

export function Surface({
  children,
  className,
  tone = 'raised',
  shape = 'default',
  ...props
}: SurfaceProps) {
  return (
    <div
      className={cn('border border-outline', shapeClasses[shape], toneClasses[tone], className)}
      {...props}
    >
      {children}
    </div>
  );
}

'use client';

import Image from 'next/image';
import { useSyncExternalStore } from 'react';
import horizontalDarkLogo from './assets/ksiegowy-vibe-horizontal-dark.svg';
import horizontalLightLogo from './assets/ksiegowy-vibe-horizontal-light.svg';
import lockupDarkLogo from './assets/ksiegowy-vibe-lockup-dark.svg';
import lockupLightLogo from './assets/ksiegowy-vibe-lockup-light.svg';
import { cn } from '../../lib/cn';

type BrandImageVariant = 'horizontal' | 'lockup';

interface BrandImageProps {
  className?: string;
  alt?: string;
  priority?: boolean;
  sizes?: string;
  variant?: BrandImageVariant;
}

const themeChangeEventName = 'ksiegowy-theme-change';

function subscribeToThemeChanges(onStoreChange: () => void) {
  window.addEventListener(themeChangeEventName, onStoreChange);
  return () => window.removeEventListener(themeChangeEventName, onStoreChange);
}

function getCurrentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function BrandImage({
  className,
  alt = 'Księgowy Vibe logo',
  priority = false,
  sizes = '(max-width: 640px) 132px, 168px',
  variant = 'horizontal',
}: BrandImageProps) {
  const theme = useSyncExternalStore(subscribeToThemeChanges, getCurrentTheme, () => 'light');
  const logo = variant === 'lockup'
    ? theme === 'dark' ? lockupDarkLogo : lockupLightLogo
    : theme === 'dark' ? horizontalDarkLogo : horizontalLightLogo;

  return <Image src={logo} alt={alt} priority={priority} sizes={sizes} className={cn('h-auto w-[168px]', className)} />;
}

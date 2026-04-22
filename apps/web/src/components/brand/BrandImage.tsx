import Image from 'next/image';
import logoImage from './assets/logo.png';
import { cn } from '../../lib/cn';

interface BrandImageProps {
  className?: string;
  alt?: string;
  priority?: boolean;
  sizes?: string;
}

export function BrandImage({
  className,
  alt = 'Księgowy Vibe logo',
  priority = false,
  sizes = '(max-width: 640px) 132px, 168px',
}: BrandImageProps) {
  return <Image src={logoImage} alt={alt} priority={priority} sizes={sizes} className={cn('h-auto w-[168px]', className)} />;
}

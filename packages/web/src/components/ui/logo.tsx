import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export interface LogoProps {
  variant?: 'words' | 'icon';
  className?: string;
  width?: number;
  height?: number;
}

export function Logo({ variant = 'words', className, width, height }: LogoProps) {
  // Default sizes based on variant
  const defaultWidth = variant === 'words' ? 200 : 40;
  const defaultHeight = variant === 'words' ? 50 : 40;

  const logoSrc = variant === 'words' ? '/images/logo-words.svg' : '/images/logo-icon.svg';
  const alt = variant === 'words' ? 'HandyCall Logo' : 'HandyCall Icon';

  return (
    <div className={cn('relative flex items-center', className)}>
      <Image
        src={logoSrc}
        alt={alt}
        width={width || defaultWidth}
        height={height || defaultHeight}
        className="object-contain"
        priority
      />
    </div>
  );
}

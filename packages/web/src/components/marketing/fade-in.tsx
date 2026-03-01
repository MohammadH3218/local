'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type FadeInProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  duration?: number;
  threshold?: number;
  once?: boolean;
};

export function FadeIn({
  children,
  className,
  delay = 0,
  direction = 'up',
  duration = 600,
  threshold = 0.15,
  once = true,
}: FadeInProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (once) observer.unobserve(el);
        } else if (!once) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, once]);

  const directionStyles: Record<string, string> = {
    up: 'translate-y-[28px]',
    down: '-translate-y-[28px]',
    left: 'translate-x-[28px]',
    right: '-translate-x-[28px]',
    none: '',
  };

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all ease-out',
        isVisible
          ? 'opacity-100 translate-x-0 translate-y-0'
          : cn('opacity-0', directionStyles[direction]),
        className
      )}
      style={{
        transitionDuration: `${duration}ms`,
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type AnimatedCounterProps = {
  value: string;
  className?: string;
  duration?: number;
};

export function AnimatedCounter({ value, className, duration = 1800 }: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [displayed, setDisplayed] = useState(value);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;

          // Extract numeric portion
          const match = value.match(/^([<>]?)(\d+(?:\.\d+)?)(.*)/);
          if (!match) {
            setDisplayed(value);
            return;
          }

          const prefix = match[1];
          const target = parseFloat(match[2]);
          const suffix = match[3];
          const isDecimal = match[2].includes('.');
          const startTime = performance.now();

          const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = eased * target;

            if (isDecimal) {
              setDisplayed(`${prefix}${current.toFixed(1)}${suffix}`);
            } else {
              setDisplayed(`${prefix}${Math.round(current)}${suffix}`);
            }

            if (progress < 1) {
              requestAnimationFrame(animate);
            }
          };

          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref} className={cn(className)}>
      {displayed}
    </span>
  );
}

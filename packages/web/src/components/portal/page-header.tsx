import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
};

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  meta,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">{title}</h1>
          {subtitle ? <p className="max-w-2xl text-sm text-slate-600">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">{meta}</div> : null}
    </div>
  );
}

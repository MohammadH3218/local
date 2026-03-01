import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-100 bg-emerald-50/40 px-6 py-10 text-center',
        className
      )}
    >
      {icon ? <div className="mb-3 text-emerald-600">{icon}</div> : null}
      <p className="text-lg font-semibold text-slate-900">{title}</p>
      <p className="mt-2 max-w-md text-sm text-slate-500">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

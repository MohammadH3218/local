'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Building2,
  Calendar,
  CreditCard,
  LayoutGrid,
  MessageSquare,
  Phone,
  Settings,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/admin', label: 'Overview', icon: LayoutGrid },
  { href: '/admin/companies', label: 'Companies', icon: Building2 },
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { href: '/admin/usage', label: 'Usage', icon: BarChart3 },
  { href: '/admin/calls', label: 'Calls', icon: Phone },
  { href: '/admin/appointments', label: 'Appointments', icon: Calendar },
  { href: '/admin/knowledge', label: 'Knowledge Base', icon: MessageSquare },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:border-r lg:border-border lg:bg-white/80 lg:backdrop-blur">
      <div className="px-6 py-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Admin CRM</p>
        <p className="mt-1 text-lg font-semibold text-foreground">HandyCall</p>
      </div>
      <nav className="flex-1 space-y-1 px-3 pb-6">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-muted-foreground hover:bg-emerald-50/60 hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

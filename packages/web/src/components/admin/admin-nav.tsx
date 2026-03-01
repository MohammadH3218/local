'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const links = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/companies', label: 'Companies' },
  { href: '/admin/users', label: 'Users' },
  { href: '/dashboard', label: 'Customer Portal' },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm font-medium">
      {links.map((link) => {
        const active = pathname === link.href || (link.href !== '/admin' && pathname.startsWith(link.href));
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'rounded-md px-3 py-2 transition-colors',
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

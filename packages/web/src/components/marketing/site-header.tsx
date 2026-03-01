'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Logo } from '../ui/logo';
import { IconMenu2, IconX } from '@tabler/icons-react';

type SiteHeaderVariant = 'default' | 'minimal' | 'pro';

type SiteHeaderProps = {
  variant?: SiteHeaderVariant;
  hideLogin?: boolean;
  hideLoginLink?: boolean;
};

const NAV_LINKS = [
  { href: '/#features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
];

export function SiteHeader({
  variant = 'default',
  hideLogin = false,
  hideLoginLink = false,
}: SiteHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMinimal = variant === 'minimal';

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 gap-8">

        {/* Logo */}
        <Link href="/" className="flex items-center shrink-0">
          <Logo width={140} height={34} />
        </Link>

        {/* Desktop Nav */}
        {!isMinimal && (
          <nav className="hidden items-center gap-6 md:flex flex-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}

        {/* Desktop CTA area */}
        {!hideLogin && (
          <div className="hidden md:flex items-center gap-1">
            {!hideLoginLink && (
              <Link
                href="/login"
                className="text-sm font-medium text-slate-700 hover:text-slate-900 px-3 py-2 transition-colors"
              >
                Log In
              </Link>
            )}
            <Link
              href="/register"
              className="ml-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition"
            >
              Get Started Free
            </Link>
          </div>
        )}

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <IconX className="h-5 w-5" stroke={1.5} /> : <IconMenu2 className="h-5 w-5" stroke={1.5} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-100 bg-white px-4 py-4 space-y-1">
          {!isMinimal && NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          {!hideLogin && (
            <div className="pt-3 border-t border-slate-100 space-y-2 mt-2">
              {!hideLoginLink && (
                <Link
                  href="/login"
                  className="block w-full text-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => setMobileOpen(false)}
                >
                  Log In
                </Link>
              )}
              <Link
                href="/register"
                className="block w-full text-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                onClick={() => setMobileOpen(false)}
              >
                Get Started Free
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

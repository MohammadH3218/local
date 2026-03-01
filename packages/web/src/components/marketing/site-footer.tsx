import Link from 'next/link';
import { Logo } from '@/components/ui/logo';

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white px-4 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex items-center gap-4">
          <Logo width={120} height={30} />
          <span className="text-xs text-slate-400">&copy; 2026 HandyCall. All rights reserved.</span>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-sm text-slate-500">
          <Link href="/pricing" className="transition-colors hover:text-slate-900">
            Pricing
          </Link>
          <Link href="/contact" className="transition-colors hover:text-slate-900">
            Contact
          </Link>
          <Link href="/sms-consent" className="transition-colors hover:text-slate-900">
            SMS Consent
          </Link>
          <Link href="/privacy-policy" className="transition-colors hover:text-slate-900">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-slate-900">
            Terms
          </Link>
          <Link href="mailto:hello@handycall.org" className="transition-colors hover:text-slate-900">
            hello@handycall.org
          </Link>
        </div>
      </div>
    </footer>
  );
}

import Link from 'next/link';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';

export default function BookLandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-12">
        <div className="rounded-xl border border-slate-200 bg-white p-8">
          <h1 className="text-3xl font-semibold text-slate-900">Book a Service</h1>
          <p className="mt-3 text-sm text-slate-600">
            HandyCall booking links are personalized and secure. If you received a booking link by text or email,
            open that full link to continue.
          </p>
          <p className="mt-3 text-sm text-slate-600">
            Need a new request instead? Use our request form and we&apos;ll match you with available pros.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/request"
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Request Service
            </Link>
            <Link
              href="/sms-consent"
              className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              SMS Consent Details
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

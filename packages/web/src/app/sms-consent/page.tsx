import Link from 'next/link';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';

const CONSENT_DISCLOSURE =
  'I agree to receive appointment-related text messages from HandyCall (confirmations, reminders, and updates). Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of purchase. Privacy Policy: https://handycall.org/privacy-policy | Terms: https://handycall.org/terms.';

export default function SmsConsentPage() {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-12">
        <div className="space-y-8">
          <section className="space-y-3">
            <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">HandyCall SMS Consent</h1>
            <p className="text-sm text-slate-600">
              This page documents how customers opt in to receive transactional appointment text messages from
              HandyCall.
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Program Details</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>
                <strong>Program name:</strong> HandyCall Appointment SMS
              </li>
              <li>
                <strong>Use case:</strong> Transactional messages only (appointment confirmations, reminders,
                reschedule/cancellation notices, and request status updates)
              </li>
              <li>
                <strong>Message frequency:</strong> Varies by appointment activity (typically 1-3 messages per
                appointment)
              </li>
              <li>
                <strong>Opt-out:</strong> Reply STOP
              </li>
              <li>
                <strong>Help:</strong> Reply HELP or email{' '}
                <Link href="mailto:hello@handycall.org" className="text-emerald-700 underline">
                  hello@handycall.org
                </Link>
              </li>
              <li>
                <strong>Data handling:</strong> No mobile opt-in data is shared with or sold to third parties or
                affiliates for marketing or promotional purposes
              </li>
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">How Customers Opt In</h2>
            <p className="mt-2 text-sm text-slate-600">
              Customers opt in via the booking flow before any SMS is sent. During booking, customers enter their
              phone number and can optionally check an <strong>unchecked</strong> standalone SMS consent box.
              Consent is never required to submit a booking.
            </p>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Consent Disclosure</p>
              <p className="mt-2 text-sm text-slate-700">{CONSENT_DISCLOSURE}</p>
            </div>
            <div className="mt-4 text-sm text-slate-600">
              <p>
                Booking links are unique per customer and appointment (for example, <code>/book/[token]</code>).
              </p>
              <p className="mt-1">
                Public booking entry point:{' '}
                <Link href="/book" className="text-emerald-700 underline">
                  https://handycall.org/book
                </Link>
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Policy Links</h2>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              <li>
                Privacy Policy:{' '}
                <Link href="/privacy-policy" className="text-emerald-700 underline">
                  https://handycall.org/privacy-policy
                </Link>
              </li>
              <li>
                Terms and Conditions:{' '}
                <Link href="/terms" className="text-emerald-700 underline">
                  https://handycall.org/terms
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

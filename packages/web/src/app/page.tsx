import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import { FadeIn } from '@/components/marketing/fade-in';
import {
  IconPhone,
  IconCalendar,
  IconMessage,
  IconChartBar,
  IconArrowRight,
  IconClock,
  IconStar,
  IconUsers,
  IconCreditCard,
  IconAddressBook,
  IconFileInvoice,
  IconRepeat,
  IconArrowsExchange,
  IconShieldCheck,
} from '@tabler/icons-react';

export const metadata: Metadata = {
  title: 'HandyCall — AI Receptionist, Payments & CRM for Service Professionals',
  description:
    'Never miss a customer call again. HandyCall answers calls 24/7, auto-books appointments, manages your payments, and runs your CRM — all in one place. Try free for 14 days.',
  openGraph: {
    title: 'HandyCall for Service Professionals',
    description: 'AI receptionist, payment management, and built-in CRM for local pros — all in one platform.',
  },
};

const features = [
  {
    icon: IconPhone,
    title: 'AI Answers Every Call',
    description:
      'Your AI receptionist picks up every call in under 2 seconds — 24/7, even on holidays. No more voicemail, no more missed revenue.',
  },
  {
    icon: IconCalendar,
    title: 'Auto-Books Appointments',
    description:
      'Callers choose their preferred time from your live calendar. Jobs land on your schedule automatically while you focus on the work.',
  },
  {
    icon: IconMessage,
    title: 'Automated Follow-ups',
    description:
      'SMS reminders, confirmations, and job recaps go out automatically — keeping your customers informed and your no-show rate low.',
  },
  {
    icon: IconCreditCard,
    title: 'Payment Management',
    description:
      'Charge customers with subscriptions or one-time payments, issue refunds, track every transaction, and manage payment links — all from your dashboard.',
  },
  {
    icon: IconAddressBook,
    title: 'Built-in CRM',
    description:
      'Every caller becomes a contact. Track leads, view call and appointment history, add notes, and manage your entire customer relationship in one place.',
  },
  {
    icon: IconFileInvoice,
    title: 'Invoicing',
    description:
      'Create and send professional invoices in seconds. Track paid, outstanding, and overdue invoices with automatic status updates.',
  },
  {
    icon: IconRepeat,
    title: 'Recurring Subscriptions',
    description:
      'Set up monthly or annual service plans for your customers. Define your own pricing, trial periods, and billing intervals — then share a payment link.',
  },
  {
    icon: IconArrowsExchange,
    title: 'Connect Your Existing Tools',
    description:
      'Already using a CRM? Connect HandyCall to your existing systems. Use our platform as your all-in-one hub or alongside the tools you already love.',
  },
  {
    icon: IconChartBar,
    title: 'Real-Time Analytics',
    description:
      'See call volume, booking conversion rates, revenue trends, and lead sources at a glance. Know exactly what is growing your business.',
  },
  {
    icon: IconShieldCheck,
    title: 'Secure & Compliant',
    description:
      'Payments processed via Stripe Connect. Your customers\' data is encrypted and your funds hit your bank account on your schedule.',
  },
];

const steps = [
  {
    number: '1',
    title: 'Sign Up & Set Up',
    subtitle: '5 minutes',
    description:
      'Create your account and fill out your service profile. Tell us your service area, pricing, and availability.',
  },
  {
    number: '2',
    title: 'Forward Your Business Number',
    subtitle: 'Instant',
    description:
      'Forward your existing business number to your HandyCall line. Works with any carrier — no new number needed.',
  },
  {
    number: '3',
    title: 'Never Miss Another Lead',
    subtitle: 'Starting immediately',
    description:
      'Your AI handles every call, books jobs, collects payments, sends confirmations, and delivers a daily summary to your inbox.',
  },
];

const platformHighlights = [
  {
    label: 'AI Receptionist',
    desc: 'Answer every call 24/7, qualify leads, and book appointments automatically.',
  },
  {
    label: 'Payment Hub',
    desc: 'Accept one-time payments, set up recurring subscriptions, issue refunds, and track all revenue in one place.',
  },
  {
    label: 'Customer CRM',
    desc: 'Full contact history, lead tracking, notes, appointment records, and payment history — per customer.',
  },
  {
    label: 'Or use your own CRM',
    desc: 'Already have a CRM? HandyCall plays well with others. Use our tools for what you need and connect the rest.',
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="bg-white pt-20 pb-24">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <FadeIn>
            <span className="inline-block mb-4 rounded-full bg-emerald-50 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-emerald-700 border border-emerald-200">
              All-in-one platform for service pros
            </span>
            <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
              The front desk<br className="hidden sm:block" />{' '}
              your business <span className="text-emerald-600">deserves.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-xl text-slate-500 leading-relaxed">
              HandyCall answers every call, books appointments, manages your payments,
              and runs your customer relationships — all in one place.
            </p>

            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3.5 text-base font-semibold text-white hover:bg-emerald-700 transition"
              >
                Start Free 14-Day Trial
                <IconArrowRight className="h-4 w-4" stroke={2} />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-8 py-3.5 text-base font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                View pricing
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-400">No credit card required · Cancel anytime</p>
          </FadeIn>
        </div>
      </section>

      {/* ── Trust Strip ──────────────────────────────────────── */}
      <section className="border-y border-slate-100 bg-slate-50 py-6">
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-slate-600">
            <span className="flex items-center gap-2"><IconPhone className="h-4 w-4 text-emerald-500" stroke={1.5} /> 24/7 AI call handling</span>
            <span className="flex items-center gap-2"><IconCalendar className="h-4 w-4 text-emerald-500" stroke={1.5} /> Live calendar booking</span>
            <span className="flex items-center gap-2"><IconCreditCard className="h-4 w-4 text-emerald-500" stroke={1.5} /> Built-in payment management</span>
            <span className="flex items-center gap-2"><IconAddressBook className="h-4 w-4 text-emerald-500" stroke={1.5} /> Full CRM included</span>
            <span className="flex items-center gap-2"><IconUsers className="h-4 w-4 text-emerald-500" stroke={1.5} /> 500+ active pros</span>
            <span className="flex items-center gap-2"><IconStar className="h-4 w-4 text-emerald-500" stroke={1.5} /> 4.8 average rating</span>
          </div>
        </div>
      </section>

      {/* ── Platform Highlights ───────────────────────────────── */}
      <section className="bg-emerald-600 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <FadeIn>
            <div className="mb-10 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-200 mb-2">All-in-one or integrate</p>
              <h2 className="text-3xl font-bold text-white sm:text-4xl">
                One platform. Everything you need.
              </h2>
              <p className="mt-3 max-w-xl mx-auto text-emerald-100">
                Run your entire business from HandyCall, or plug in the tools you already use.
                Either way, it works.
              </p>
            </div>
          </FadeIn>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {platformHighlights.map((item, i) => (
              <FadeIn key={item.label} delay={i * 80}>
                <div className="rounded-2xl bg-white/10 border border-white/20 p-5 text-white">
                  <p className="font-bold text-base mb-2">{item.label}</p>
                  <p className="text-sm text-emerald-100 leading-relaxed">{item.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section id="features" className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-4">
          <FadeIn>
            <div className="mb-12">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-2">Features</p>
              <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
                Everything you need to grow
              </h2>
              <p className="mt-3 max-w-xl text-slate-500">
                HandyCall handles the front desk, the billing, and the customer relationships — so you can stay focused on the work.
              </p>
            </div>
          </FadeIn>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {features.map((feature, i) => (
              <FadeIn key={feature.title} delay={i * 60}>
                <div className="group flex h-full flex-col rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition hover:border-emerald-200 hover:shadow-md">
                  <feature.icon className="mb-4 h-7 w-7 text-emerald-600" stroke={1.5} />
                  <h3 className="mb-2 text-base font-bold text-slate-900">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-slate-500">{feature.description}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Payment Management Deep-dive ──────────────────────── */}
      <section className="border-t border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto max-w-5xl px-4">
          <FadeIn>
            <div className="grid gap-12 lg:grid-cols-2 items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-3">Payment Management</p>
                <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl mb-4">
                  Charge your customers your way
                </h2>
                <p className="text-slate-500 leading-relaxed mb-6">
                  Whether you offer monthly lawn care plans or one-time jobs, HandyCall&apos;s payment platform
                  handles every scenario. Create your service pricing, share payment links, and get paid — no
                  accounting software required.
                </p>
                <ul className="space-y-3">
                  {[
                    'Create subscription plans with custom billing intervals',
                    'Accept one-time payments for jobs and deposits',
                    'Issue full or partial refunds directly from your dashboard',
                    'View every transaction, its status, and payment history',
                    'Automated receipts and payment notifications to customers',
                    'Connect your Stripe account to receive payouts directly',
                    'Link payments to contacts for a complete customer view',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="mt-0.5 h-5 w-5 flex-shrink-0 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xs">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Your payment dashboard</p>
                {[
                  { label: 'Monthly Lawn Care Plan', amount: '$120/mo', badge: 'Subscription', color: 'bg-blue-50 text-blue-700 border-blue-200' },
                  { label: 'One-Time Deep Clean', amount: '$350', badge: 'Succeeded', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                  { label: 'Tree Trimming Deposit', amount: '$75', badge: 'Succeeded', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                  { label: 'Emergency Repair', amount: '$225', badge: 'Refunded', color: 'bg-amber-50 text-amber-700 border-amber-200' },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                      <p className="text-xs text-slate-400">{row.amount}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${row.color}`}>{row.badge}</span>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── CRM Deep-dive ────────────────────────────────────── */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-5xl px-4">
          <FadeIn>
            <div className="grid gap-12 lg:grid-cols-2 items-center">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3 order-2 lg:order-1">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Customer CRM</p>
                {[
                  { name: 'Sarah M.', detail: '3 appointments · $840 lifetime', tag: 'VIP', tagColor: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                  { name: 'James R.', detail: '1 call · Quoted $320', tag: 'Lead', tagColor: 'bg-amber-50 text-amber-700 border-amber-200' },
                  { name: 'Linda T.', detail: 'Monthly plan · $120/mo', tag: 'Subscriber', tagColor: 'bg-blue-50 text-blue-700 border-blue-200' },
                  { name: 'Mike D.', detail: 'No follow-up in 60 days', tag: 'Re-engage', tagColor: 'bg-red-50 text-red-700 border-red-200' },
                ].map((row) => (
                  <div key={row.name} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold">
                        {row.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{row.name}</p>
                        <p className="text-xs text-slate-400">{row.detail}</p>
                      </div>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${row.tagColor}`}>{row.tag}</span>
                  </div>
                ))}
              </div>
              <div className="order-1 lg:order-2">
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-3">Built-in CRM</p>
                <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl mb-4">
                  Know every customer, not just their number
                </h2>
                <p className="text-slate-500 leading-relaxed mb-6">
                  Every call, booking, message, and payment is linked to a contact. Your CRM builds itself as you work —
                  or bring your existing one and we&apos;ll connect to it.
                </p>
                <ul className="space-y-3">
                  {[
                    'Full contact profiles with call, appointment, and payment history',
                    'Lead status tracking: New → Contacted → Qualified → Converted',
                    'Notes and tags per customer for quick context',
                    'Search and filter your entire customer base instantly',
                    'See which customers are due for follow-up or re-engagement',
                    'Already have a CRM? Connect yours and keep your existing workflow',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="mt-0.5 h-5 w-5 flex-shrink-0 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xs">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────── */}
      <section id="how-it-works" className="border-t border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto max-w-5xl px-4">
          <FadeIn>
            <div className="mb-12">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-2">How It Works</p>
              <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
                Up and running in minutes
              </h2>
              <p className="mt-3 max-w-xl text-slate-500">
                No technical setup required. If you can forward a call, you can use HandyCall.
              </p>
            </div>
          </FadeIn>

          <div className="grid gap-8 sm:grid-cols-3">
            {steps.map((step, i) => (
              <FadeIn key={step.title} delay={i * 100}>
                <div className="relative">
                  {i < steps.length - 1 && (
                    <div className="absolute top-5 left-[calc(50%+2.5rem)] hidden h-px w-[calc(100%-2.5rem)] bg-slate-200 sm:block" />
                  )}
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border-2 border-slate-900 bg-white text-sm font-bold text-slate-900">
                    {step.number}
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-bold text-slate-900">{step.title}</h3>
                  </div>
                  <p className="text-xs font-medium text-slate-400 flex items-center gap-1 mb-2">
                    <IconClock className="h-3.5 w-3.5" stroke={1.5} /> {step.subtitle}
                  </p>
                  <p className="text-sm leading-relaxed text-slate-500">{step.description}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────── */}
      <section className="border-t border-slate-100 bg-slate-900 py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <FadeIn>
            <h2 className="text-4xl font-extrabold text-white sm:text-5xl">
              Ready to grow your business?
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-slate-400">
              Join 500+ service pros who use HandyCall to answer every call,
              collect every payment, and never miss a lead.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-10 py-3.5 text-base font-bold text-slate-900 hover:bg-slate-100 transition"
              >
                Start Free 14-Day Trial
                <IconArrowRight className="h-4 w-4" stroke={2} />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-8 py-3.5 text-base font-semibold text-slate-300 hover:bg-slate-800 transition"
              >
                View Pricing
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-500">No credit card · No contracts · Cancel anytime</p>
          </FadeIn>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

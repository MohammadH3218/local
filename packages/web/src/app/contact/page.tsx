'use client';

import { useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import {
  IconClock,
  IconRocket,
  IconUsers,
  IconHeadset,
  IconCircleCheck,
  IconArrowRight,
} from '@tabler/icons-react';

const points = [
  { icon: IconClock, title: 'Fast response', desc: 'We usually respond within one business day for new inquiries.' },
  { icon: IconRocket, title: 'Guided onboarding', desc: 'We help map your call flow, services, and availability so launch is smooth.' },
  { icon: IconUsers, title: 'Service teams', desc: 'Built for companies handling high call volume and recurring scheduling.' },
  { icon: IconHeadset, title: 'Hands-on support', desc: 'Our team helps you tune scripts, routing, and follow-ups.' },
];

export default function ContactPage() {
  const [formState, setFormState] = useState({ name: '', company: '', email: '', phone: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange =
    (field: keyof typeof formState) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFormState((prev) => ({ ...prev, [field]: event.target.value }));
    };

  return (
    <div className="min-h-screen bg-white text-foreground">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-16">
        <div className="mb-14 text-center">
          <h1 className="text-[2.6rem] font-bold leading-[1.08] tracking-tight text-slate-900 md:text-5xl">
            Tell us about your phone line.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-500">
            Whether you&apos;re ready to activate a plan or want to see a demo, we can map the best setup for your
            service business.
          </p>
        </div>

        <div className="grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          {/* ── Left: context ── */}
          <div className="space-y-6 lg:pt-2">
            <div className="space-y-3">
              {points.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-white p-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                      <Icon className="h-4 w-4 text-slate-600" stroke={1.5} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-0.5 text-sm text-slate-500">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
              <p className="text-sm font-semibold text-slate-900">Prefer email?</p>
              <p className="mt-0.5 text-sm text-slate-700">
                Reach us at{' '}
                <Link href="mailto:hello@handycall.org" className="font-semibold text-emerald-600 underline">
                  hello@handycall.org
                </Link>
              </p>
            </div>
          </div>

          {/* ── Right: form ── */}
          <div className="rounded-xl border border-slate-200 bg-white p-8">
            {status === 'sent' ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <IconCircleCheck className="h-12 w-12 text-emerald-600" stroke={1.5} />
                <h3 className="mt-4 text-xl font-semibold text-slate-900">Message received!</h3>
                <p className="mt-2 text-sm text-slate-500">
                  Thanks for reaching out. We&apos;ll reply within one business day.
                </p>
                <button
                  type="button"
                  onClick={() => setStatus('idle')}
                  className="mt-6 flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition"
                >
                  Send another message
                  <IconArrowRight className="h-4 w-4" stroke={1.5} />
                </button>
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-slate-900">Get in touch</h2>
                  <p className="mt-1 text-sm text-slate-500">We respond within one business day.</p>
                </div>

                {status === 'error' && (
                  <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errorMessage}
                  </div>
                )}

                <form
                  className="space-y-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setStatus('sending');
                    setErrorMessage('');
                    try {
                      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/contact`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(formState),
                      });
                      if (!response.ok) {
                        const data = await response.json().catch(() => ({}));
                        throw new Error(data?.message || 'Unable to send your message right now.');
                      }
                      setStatus('sent');
                      setFormState({ name: '', company: '', email: '', phone: '', message: '' });
                    } catch (err: any) {
                      setStatus('error');
                      setErrorMessage(err?.message || 'Unable to send your message right now.');
                    }
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1.5">Full name</label>
                      <input
                        id="name"
                        placeholder="Your name"
                        required
                        value={formState.name}
                        onChange={handleChange('name')}
                        className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                      />
                    </div>
                    <div>
                      <label htmlFor="company" className="block text-sm font-medium text-slate-700 mb-1.5">Company</label>
                      <input
                        id="company"
                        placeholder="Business name"
                        required
                        value={formState.company}
                        onChange={handleChange('company')}
                        className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                    <input
                      id="email"
                      type="email"
                      placeholder="you@business.com"
                      required
                      value={formState.email}
                      onChange={handleChange('email')}
                      className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1.5">
                      Phone <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <input
                      id="phone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      value={formState.phone}
                      onChange={handleChange('phone')}
                      className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>
                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-slate-700 mb-1.5">How can we help?</label>
                    <textarea
                      id="message"
                      placeholder="Share your call volume, services, and goals — the more detail, the better we can help."
                      rows={4}
                      value={formState.message}
                      onChange={handleChange('message')}
                      className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 resize-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={status === 'sending'}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition"
                  >
                    {status === 'sending' ? 'Sending…' : 'Send message'}
                    {status !== 'sending' && <IconArrowRight className="h-4 w-4" stroke={1.5} />}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

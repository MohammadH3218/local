'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/marketing/site-header';
import { IconCircleCheck } from '@tabler/icons-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (cooldownUntil && Date.now() < cooldownUntil) {
      return;
    }
    setStatus('sending');
    setErrorMessage('');
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || 'Unable to send reset link.');
      }
      const until = Date.now() + 30_000;
      setCooldownUntil(until);
      setCooldownSeconds(30);
      setStatus('sent');
      const timer = window.setInterval(() => {
        setCooldownSeconds((prev) => {
          if (prev <= 1) {
            window.clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err?.message || 'Unable to send reset link.');
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 pb-16 pt-12 w-full">
        <div className="mx-auto max-w-sm rounded-xl border border-slate-200 bg-white p-8">
          <h1 className="text-2xl font-bold text-slate-900">Reset your password</h1>

          {status === 'sent' ? (
            <div className="space-y-4 mt-6">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                <IconCircleCheck className="h-7 w-7" stroke={1.5} />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-slate-900">Reset link sent</p>
                <p className="mt-2 text-sm text-slate-600">
                  If that email exists, a reset link has been sent. Please check your inbox and spam.
                </p>
                {cooldownSeconds > 0 ? (
                  <p className="mt-3 text-xs text-slate-500">
                    You can request another link in {cooldownSeconds}s.
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">
                    Didn&apos;t get it? You can resend now.
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={cooldownSeconds > 0}
                onClick={() => setStatus('idle')}
                className="flex h-11 w-full items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition"
              >
                {cooldownSeconds > 0 ? 'Resend link' : 'Send another link'}
              </button>
              <p className="text-xs text-slate-500 text-center">
                Return to <Link className="text-emerald-600 underline" href="/login">sign in</Link>.
              </p>
            </div>
          ) : (
            <form className="space-y-4 mt-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <input
                  id="email"
                  type="email"
                  placeholder="you@business.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <button
                type="submit"
                disabled={status === 'sending'}
                className="flex h-11 w-full items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition"
              >
                {status === 'sending' ? 'Sending...' : 'Send reset link'}
              </button>
              {status === 'error' ? (
                <p className="text-xs text-red-600">{errorMessage}</p>
              ) : (
                <p className="text-xs text-slate-500">
                  Return to <Link className="text-emerald-600 underline" href="/login">sign in</Link>.
                </p>
              )}
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

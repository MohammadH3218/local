'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { SiteHeader } from '@/components/marketing/site-header';

const maskEmail = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.includes('@')) return trimmed;
  const [local, domain] = trimmed.split('@');
  if (!local || !domain) return trimmed;
  const maskedLocal = local.length <= 2 ? `${local[0] || ''}*` : `${local.slice(0, 2)}***`;
  return `${maskedLocal}@${domain}`;
};

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const emailParam = searchParams.get('email') || '';
  const tokenParam = searchParams.get('token') || '';

  const [email, setEmail] = useState(emailParam);
  const [token, setToken] = useState(tokenParam);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const maskedEmail = useMemo(() => maskEmail(email), [email]);

  useEffect(() => {
    if (!emailParam && !tokenParam) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('email');
    url.searchParams.delete('token');
    window.history.replaceState({}, document.title, url.toString());
  }, [emailParam, tokenParam]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage('');
    if (!email || !token) {
      setStatus('error');
      setErrorMessage('Reset link is missing or expired. Please request a new one.');
      return;
    }
    if (password !== confirm) {
      setStatus('error');
      setErrorMessage('Passwords do not match.');
      return;
    }
    setStatus('sending');
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/confirm-forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, new_password: password }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || 'Unable to reset password.');
      }
      setStatus('sent');
      setTimeout(() => router.push('/login'), 1200);
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err?.message || 'Unable to reset password.');
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 pb-16 pt-12">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h1 className="text-xl font-semibold text-slate-900">Choose a new password</h1>
          <div className="mt-4">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Email</label>
                <input
                  value={maskedEmail || 'Unknown'}
                  readOnly
                  className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">New password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="confirm" className="block text-sm font-medium text-slate-700">Confirm password</label>
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={status === 'sending'}
              >
                {status === 'sending' ? 'Updating...' : 'Update password'}
              </button>
              {status === 'sent' ? (
                <p className="text-xs text-emerald-700">Password updated. Redirecting to sign in...</p>
              ) : null}
              {status === 'error' ? (
                <p className="text-xs text-red-600">{errorMessage}</p>
              ) : null}
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

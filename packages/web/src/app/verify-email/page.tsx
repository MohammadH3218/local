'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';

function VerifyEmailPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams?.get('email') || '';
  const codeParam = searchParams?.get('code') || '';
  const poolType: 'users' = 'users';
  const loginHref = '/login';

  const [email, setEmail] = useState(emailParam);
  const [code, setCode] = useState(codeParam);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const canAutoVerify = useMemo(() => Boolean(emailParam && codeParam), [emailParam, codeParam]);

  useEffect(() => {
    setEmail(emailParam);
    if (!code) {
      setCode(codeParam);
    }
  }, [emailParam, codeParam, code]);

  useEffect(() => {
    if (!canAutoVerify) return;
    const run = async () => {
      setIsSubmitting(true);
      setError('');
      try {
        await apiClient.confirmSignUp({ email: emailParam, code: codeParam, pool_type: poolType });
        setSuccess('Email verified successfully. You can now sign in.');
        setTimeout(() => {
          router.replace(loginHref);
        }, 1200);
      } catch (err: any) {
        setError(err?.message || 'Verification failed. Please enter the code from your email.');
      } finally {
        setIsSubmitting(false);
      }
    };
    void run();
  }, [canAutoVerify, emailParam, codeParam, poolType, loginHref, router]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!email.trim() || !code.trim()) {
      setError('Please enter your email and verification code.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.confirmSignUp({ email: email.trim(), code: code.trim(), pool_type: poolType });
      setSuccess('Email verified successfully. You can now sign in.');
      setTimeout(() => {
        router.replace(loginHref);
      }, 800);
    } catch (err: any) {
      setError(err?.message || 'Verification failed. Please check the code and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setSuccess('');
    if (!email.trim()) {
      setError('Enter your email to resend the verification code.');
      return;
    }
    setIsResending(true);
    try {
      await apiClient.resendConfirmation({ email: email.trim(), pool_type: poolType });
      setSuccess('Verification email sent. Check your inbox for the code.');
    } catch (err: any) {
      setError(err?.message || 'Unable to resend verification email.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-12">
        <div className="mx-auto max-w-lg space-y-6">
          <div className="space-y-3 text-center">
            <span className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              Verify your email
            </span>
            <h1 className="text-3xl font-bold text-slate-900">Check your inbox</h1>
            <p className="text-sm text-slate-600">
              We sent a verification code to your email. Enter it below to activate your account.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Email verification</h2>
              <p className="text-sm text-slate-500">Once verified, you can sign in and continue setup.</p>
            </div>
            <form onSubmit={handleVerify}>
              <div className="mt-5 space-y-4">
                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="rounded-md border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700">
                    {success}
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@business.com"
                    required
                    disabled={isSubmitting}
                    className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="code" className="block text-sm font-medium text-slate-700">Verification code</label>
                  <input
                    id="code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                    required
                    disabled={isSubmitting}
                    className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-3">
                <button
                  type="submit"
                  className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Verifying...' : 'Verify email'}
                </button>
                <button
                  type="button"
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleResend}
                  disabled={isResending}
                >
                  {isResending ? 'Sending...' : 'Resend verification email'}
                </button>
                <p className="text-center text-sm text-slate-500">
                  Already verified?{' '}
                  <Link href={loginHref} className="font-semibold text-emerald-600 hover:underline">
                    Sign in
                  </Link>
                </p>
              </div>
            </form>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailPageInner />
    </Suspense>
  );
}

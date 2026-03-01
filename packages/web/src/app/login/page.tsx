'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signIn, signOut } from 'next-auth/react';
import { useSession, getSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Logo } from '@/components/ui/logo';
import { useAuthStore } from '@/stores/auth-store';
import { SiteFooter } from '@/components/marketing/site-footer';
import { IconCircleCheck, IconArrowRight } from '@tabler/icons-react';

/* ── SVG brand icons ── */
const GoogleIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.72 1.22 9.22 3.6l6.9-6.9C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l8.04 6.24C12.6 13.09 17.86 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24c0-1.64-.15-3.22-.43-4.74H24v9h12.7c-.55 3-2.2 5.55-4.7 7.27l7.2 5.6C43.94 36.5 46.5 30.8 46.5 24z" />
    <path fill="#FBBC05" d="M10.6 28.46c-.48-1.44-.76-2.98-.76-4.46s.27-3.02.76-4.46l-8.04-6.24C.92 16.16 0 19.97 0 24c0 4.03.92 7.84 2.56 11.2l8.04-6.24z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.77l-7.2-5.6c-2 1.35-4.56 2.13-8.7 2.13-6.14 0-11.4-3.59-13.4-8.72l-8.04 6.24C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

const AppleIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path fill="currentColor" d="M16.7 12.3c0-2.1 1.7-3.1 1.7-3.1-1-1.5-2.6-1.7-3.1-1.7-1.3-.1-2.6.8-3.3.8-.7 0-1.8-.8-3-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.7-.4 6.7 1.1 8.9.7 1.1 1.6 2.4 2.8 2.3 1.1 0 1.6-.7 2.9-.7 1.3 0 1.7.7 3 .7 1.2 0 2-.9 2.7-2 .9-1.3 1.2-2.6 1.2-2.7-.1 0-2.3-.9-2.3-3.9z" />
    <path fill="currentColor" d="M14.9 4.2c.6-.7 1-1.7.9-2.7-.9.1-1.9.6-2.5 1.3-.6.7-1.1 1.7-.9 2.7 1 .1 2-.5 2.5-1.3z" />
  </svg>
);

const PRO_FEATURES = [
  { title: '24/7 AI coverage', desc: 'Answers in ~2 seconds with your approved scripts and pricing rules.' },
  { title: 'Real-time dashboard', desc: 'Transcripts, summaries, and lead capture — all in one place.' },
  { title: 'Smart scheduling', desc: 'Books jobs from your live calendar and sends confirmations automatically.' },
  { title: 'Automated follow-up', desc: 'SMS reminders and recaps keep your prospects warm without lifting a finger.' },
];

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get('callbackUrl') || undefined;
  const audienceParam = (searchParams?.get('audience') || '').toLowerCase();
  const { status } = useSession();
  const { changePassword, requiresPasswordChange, passwordChangeSession, passwordChangePoolType, email: storeEmail } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'cognito-google' | 'cognito-apple' | null>(null);
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);

  const isAdminPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
  const isAdminAudience = audienceParam === 'admin' || isAdminPath;
  const loginPoolType: 'users' | 'admin' = isAdminAudience ? 'admin' : 'users';
  const defaultCallbackUrl = callbackUrl || (isAdminAudience ? '/admin' : '/dashboard');

  const parsePasswordChangeError = (message: string) => {
    if (!message?.startsWith('NEW_PASSWORD_REQUIRED:')) return null;
    const encoded = message.split('NEW_PASSWORD_REQUIRED:')[1];
    if (!encoded) return null;
    try {
      const decoded = typeof window !== 'undefined' && typeof window.atob === 'function'
        ? window.atob(encoded)
        : Buffer.from(encoded, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch { return null; }
  };

  useEffect(() => { if (storeEmail) setEmail(storeEmail); }, [storeEmail]);
  useEffect(() => { if (requiresPasswordChange) setShowPasswordChangeModal(true); }, [requiresPasswordChange]);

  useEffect(() => {
    const clearStaleSession = async () => {
      if (status === 'authenticated') {
        try {
          const latestSession = await getSession();
          const accessToken = (latestSession as any)?.accessToken as string | undefined;
          const idToken = (latestSession as any)?.idToken as string | undefined;
          if (!accessToken && !idToken) {
            await signOut({ redirect: false });
          }
        } catch { /* ignore */ }
      }
    };
    clearStaleSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNeedsVerification(false);
    setIsLoading(true);
    try {
      const result = await signIn('credentials', {
        email, password, pool_type: loginPoolType, redirect: false,
        callbackUrl: defaultCallbackUrl,
      });
      if (result?.error) {
        const parsed = parsePasswordChangeError(result.error);
        if (parsed?.code === 'NEW_PASSWORD_REQUIRED' && parsed?.session) {
          useAuthStore.setState({
            requiresPasswordChange: true, passwordChangeSession: parsed.session,
            passwordChangePoolType: parsed.poolType || 'users',
            email: parsed.email || email, userRole: parsed.userRole || null,
            isAuthenticated: false, isLoading: false,
          });
          setShowPasswordChangeModal(true);
          setIsLoading(false);
          return;
        }
        const requiresVerification =
          result.error?.includes('verify your email') || result.error?.includes('Email not verified');
        setError(requiresVerification ? 'Please verify your email before signing in.' : result.error || 'Invalid email or password');
        setNeedsVerification(requiresVerification);
        setIsLoading(false);
        return;
      }
      if (result?.url) { router.replace(result.url); return; }
      router.replace(defaultCallbackUrl);
    } catch (err: any) { setError(err.message || 'Invalid email or password'); }
    setIsLoading(false);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (!passwordChangeSession) { setError('Session expired. Please login again.'); return; }
    setIsLoading(true);
    try {
      await changePassword(email, newPassword, passwordChangeSession!, passwordChangePoolType || undefined);
      const loginResult = await signIn('credentials', {
        email,
        password: newPassword,
        pool_type: passwordChangePoolType || loginPoolType,
        redirect: false,
        callbackUrl: defaultCallbackUrl,
      });
      if (loginResult?.error) { setError(loginResult.error); return; }
      setShowPasswordChangeModal(false);
      setNewPassword('');
      setConfirmPassword('');
      if (loginResult?.url) { router.replace(loginResult.url); return; }
      router.replace(defaultCallbackUrl);
    } catch (err: any) { setError(err.message || 'Failed to change password'); }
    finally { setIsLoading(false); }
  };

  const handleSocialSignIn = async (provider: 'cognito-google' | 'cognito-apple') => {
    setError('');
    setSocialLoading(provider);
    try {
      const result = await signIn(provider, { callbackUrl: defaultCallbackUrl });
      if (result?.error) { setError(result.error); setSocialLoading(null); }
    } catch (err: any) { setError(err?.message || 'Unable to start social sign-in.'); setSocialLoading(null); }
  };

  return (
    <div className="min-h-screen bg-white text-foreground">
      {/* Minimal top bar */}
      <header className="border-b border-slate-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/">
            <Logo variant="words" width={148} height={36} />
          </Link>
          <p className="text-sm text-slate-500">
            New here?{' '}
            <Link href="/register" className="font-semibold text-emerald-600 hover:text-emerald-700">
              Create a pro account
            </Link>
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl items-start gap-12 px-4 pb-20 pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-20">
        {/* ── Left: product context ── */}
        <div className="space-y-8">
          <div>
            <h1 className="text-[2.6rem] font-bold leading-[1.08] tracking-tight text-slate-900 md:text-5xl">
              Your AI receptionist is ready.
            </h1>
            <p className="mt-4 max-w-md text-lg text-slate-500">
              Sign in to manage calls, review leads, and monitor your AI in real time.
            </p>
          </div>

          <div className="space-y-4">
            {PRO_FEATURES.map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <IconCircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" stroke={1.5} />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="text-sm text-slate-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Mini context widget */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-100/80 max-w-sm">
            <div className="flex items-center justify-between bg-slate-900 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-red-400/80" />
                  <div className="h-2 w-2 rounded-full bg-amber-400/80" />
                  <div className="h-2 w-2 rounded-full bg-emerald-400/80" />
                </div>
                <span className="ml-1 text-xs text-slate-500">Live call</span>
              </div>
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                Answering
              </span>
            </div>
            <div className="space-y-3 px-4 py-4 text-sm">
              {[
                { role: 'Caller', text: '"Need an AC tune-up before summer hits."', isAI: false },
                { role: 'HandyCall', text: '"I have Thursday at 10 AM open. Does that work?"', isAI: true },
                { role: 'Caller', text: '"Perfect."', isAI: false },
                { role: 'HandyCall', text: '"Booked! Confirmation text on its way."', isAI: true },
              ].map((msg, i) => (
                <div key={i} className="flex gap-2.5">
                  <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${msg.isAI ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {msg.isAI ? 'H' : 'C'}
                  </div>
                  <p className="text-slate-700">{msg.text}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 bg-emerald-50/60 px-4 py-2.5">
              <p className="text-xs font-semibold text-emerald-700">Booked · AC tune-up · Thu 10:00 AM ✓</p>
            </div>
          </div>
        </div>

        {/* ── Right: form ── */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-8">
          <div className="mb-6 text-center">
            <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500">Access your HandyCall pro workspace</p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
              {needsVerification && (
                <span className="mt-1.5 block">
                  <Link href={`/verify-email?email=${encodeURIComponent(email)}`} className="font-semibold underline">
                    Verify your email →
                  </Link>
                </span>
              )}
            </div>
          )}

          {/* Social buttons */}
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => handleSocialSignIn('cognito-google')}
              disabled={isLoading || Boolean(socialLoading)}
              className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <GoogleIcon className="h-4 w-4" />
              {socialLoading === 'cognito-google' ? 'Connecting to Google…' : 'Continue with Google'}
            </button>
            <button
              type="button"
              onClick={() => handleSocialSignIn('cognito-apple')}
              disabled={isLoading || Boolean(socialLoading)}
              className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <AppleIcon className="h-4 w-4" />
              {socialLoading === 'cognito-apple' ? 'Connecting to Apple…' : 'Continue with Apple'}
            </button>
          </div>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400">or sign in with email</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-slate-700">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@business.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-semibold text-slate-700">Password</Label>
                <Link href="/forgot-password" className="text-xs font-medium text-emerald-600 hover:text-emerald-700">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="h-11"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition"
            >
              {isLoading ? 'Signing in…' : 'Sign in'}
              {!isLoading && <IconArrowRight className="h-4 w-4" stroke={1.5} />}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            New to HandyCall?{' '}
            <Link href="/register" className="font-semibold text-emerald-600 hover:text-emerald-700">
              Create a pro account
            </Link>
          </p>
        </div>
      </main>

      {/* Password change modal */}
      <Dialog open={showPasswordChangeModal} onOpenChange={setShowPasswordChangeModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Set a new password</DialogTitle>
            <DialogDescription>
              Your account requires a password change before you can continue.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePasswordChange}>
            <div className="space-y-4 py-4">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" placeholder="Minimum 8 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required disabled={isLoading} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input id="confirm-password" type="password" placeholder="Re-enter your password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required disabled={isLoading} />
              </div>
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                Must be at least 8 characters with uppercase, lowercase, and numbers.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Updating…' : 'Set new password'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <SiteFooter />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/ui/logo';
import {
  IconEye,
  IconEyeOff,
  IconArrowRight,
  IconShield,
  IconStar,
  IconCircleCheck,
} from '@tabler/icons-react';

const BENEFITS = [
  { icon: IconStar, text: 'Read verified reviews from real customers' },
  { icon: IconCircleCheck, text: 'Book in minutes — no phone tag' },
  { icon: IconShield, text: 'Pay securely after the job is done' },
];

export default function SignUpPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) { setError('Please agree to the Terms and Privacy Policy.'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Sign up failed. Please try again.');
      }
      router.push('/login?message=Account+created%21+Please+log+in.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left panel — benefits */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center bg-slate-50 border-r border-slate-100 px-16 py-20">
        <Link href="/">
          <Logo width={148} height={36} />
        </Link>
        <div className="mt-14">
          <h2 className="text-3xl font-extrabold text-slate-900 leading-tight">
            Find trusted pros<br />for any home project.
          </h2>
          <p className="mt-4 text-slate-500 text-base leading-relaxed max-w-sm">
            Create a free account to save favorites, track bookings, and get quotes from verified local professionals.
          </p>
          <ul className="mt-10 space-y-5">
            {BENEFITS.map((b) => (
              <li key={b.text} className="flex items-start gap-3">
                <b.icon className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" stroke={1.5} />
                <span className="text-sm text-slate-700">{b.text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-12 text-xs text-slate-400">
            Are you a service professional?{' '}
            <Link href="/register?audience=pro" className="font-semibold text-slate-600 hover:text-slate-900 underline underline-offset-2">
              Join as a Pro instead
            </Link>
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        {/* Mobile logo */}
        <div className="mb-8 lg:hidden">
          <Link href="/">
            <Logo width={140} height={34} />
          </Link>
        </div>

        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
          <p className="mt-1 text-sm text-slate-500">
            Already have one?{' '}
            <Link href="/login" className="font-semibold text-emerald-600 hover:text-emerald-700">
              Log in
            </Link>
          </p>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Full name</label>
              <input
                type="text"
                required
                placeholder="Jane Smith"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                required
                placeholder="jane@example.com"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 pr-10 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword
                    ? <IconEyeOff className="h-4 w-4" stroke={1.5} />
                    : <IconEye className="h-4 w-4" stroke={1.5} />
                  }
                </button>
              </div>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-emerald-600"
              />
              <span className="text-xs text-slate-500 leading-relaxed">
                I agree to the{' '}
                <Link href="/terms" className="underline hover:text-slate-700">Terms of Service</Link>
                {' '}and{' '}
                <Link href="/privacy-policy" className="underline hover:text-slate-700">Privacy Policy</Link>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition"
            >
              {loading ? 'Creating account...' : (
                <>Create Account <IconArrowRight className="h-4 w-4" stroke={2} /></>
              )}
            </button>
          </form>

          {/* Mobile pro link */}
          <p className="mt-6 text-center text-xs text-slate-400 lg:hidden">
            Service professional?{' '}
            <Link href="/register?audience=pro" className="font-semibold text-slate-600 hover:text-slate-900 underline underline-offset-2">
              Join as a Pro
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

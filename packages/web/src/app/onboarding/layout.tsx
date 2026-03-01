'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { OnboardingProvider, useOnboarding } from '@/components/onboarding/onboarding-context';
import { ONBOARDING_STEPS } from '@/constants/onboarding';
import { Logo } from '@/components/ui/logo';
import { IconCircleCheck, IconCircle } from '@tabler/icons-react';
import { UserRole } from '@handycall/shared';
import { useAuthStore } from '@/stores/auth-store';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingProvider>
      <OnboardingShell>{children}</OnboardingShell>
    </OnboardingProvider>
  );
}

function OnboardingShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, isAuthenticated, userRole, status } = useOnboarding();
  const { logout } = useAuthStore();
  const [signingOut, setSigningOut] = useState(false);

  const isSetupPage = pathname?.startsWith('/onboarding/setup') ?? false;

  const stepMap = useMemo(
    () => ({
      profile: status.profile,
      billing: status.billing,
      company: status.companyProfile,
      'service-area': status.serviceArea,
      knowledge: status.knowledge,
      calendar: status.calendar,
      phone: status.phone,
    }),
    [status]
  );

  const currentStepId = (pathname?.split('/')[2] || 'billing') as keyof typeof stepMap;
  const currentIndex = ONBOARDING_STEPS.findIndex((step) => step.id === currentStepId);
  const firstIncompleteIndex = ONBOARDING_STEPS.findIndex((step) => !stepMap[step.id]);
  const completedCount = ONBOARDING_STEPS.filter((step) => stepMap[step.id]).length;
  const allComplete = completedCount === ONBOARDING_STEPS.length;

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    if (userRole === UserRole.ADMIN) {
      router.replace('/admin');
      return;
    }

    if (allComplete) {
      router.replace('/dashboard');
      return;
    }

    // Don't redirect away from the chatbot setup page
    if (isSetupPage) return;

    const fallbackIndex = firstIncompleteIndex === -1 ? 0 : firstIncompleteIndex;
    if (currentIndex === -1 || currentIndex > fallbackIndex) {
      router.replace(`/onboarding/${ONBOARDING_STEPS[fallbackIndex].id}`);
    }
  }, [allComplete, currentIndex, firstIncompleteIndex, isAuthenticated, isSetupPage, loading, router, userRole]);

  // Never replace children with a spinner on the setup page — that would unmount and restart the chat.
  if (loading && !isSetupPage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
          <p className="mt-4 text-sm text-slate-500">Preparing your setup...</p>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  };

  // Full-screen chatbot layout for the setup page
  if (isSetupPage) {
    return (
      <div className="flex h-screen flex-col bg-white">
        <header className="flex-none border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-3">
              <Logo width={130} height={32} />
            </Link>
            <div className="flex items-center gap-3">
              <span className="hidden items-center rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 sm:inline-flex">
                AI Setup Assistant
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="text-sm text-slate-500 transition hover:text-slate-700 disabled:opacity-60"
              >
                {signingOut ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          </div>
        </header>
        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Logo width={150} height={36} />
          </Link>
          <span className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            Guided setup
          </span>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 pt-10 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wide text-slate-500">Progress</p>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-lg font-semibold text-slate-900">
                {completedCount} / {ONBOARDING_STEPS.length} complete
              </p>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-emerald-500 transition-all"
                style={{ width: `${(completedCount / ONBOARDING_STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="space-y-4">
            {ONBOARDING_STEPS.map((step, index) => {
              const isComplete = stepMap[step.id];
              const isLocked = firstIncompleteIndex !== -1 && index > firstIncompleteIndex;
              const isActive = step.id === currentStepId;

              return (
                <Link
                  key={step.id}
                  href={isLocked ? '#' : `/onboarding/${step.id}`}
                  className={`group block rounded-lg border px-4 py-3 transition ${
                    isActive
                      ? 'border-emerald-100 bg-emerald-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  } ${isLocked ? 'pointer-events-none opacity-50' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {isComplete ? (
                        <IconCircleCheck className="h-5 w-5 text-emerald-600" stroke={1.5} />
                      ) : (
                        <IconCircle className="h-5 w-5 text-slate-300" stroke={1.5} />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{step.label}</p>
                      <p className="text-xs text-slate-600">{step.description}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            Need help? Email support@handycall.org or book a quick onboarding call.
          </div>
        </aside>

        <main className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="animate-fade-up">{children}</div>
          <div className="mt-8 flex justify-between">
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signingOut ? 'Signing out...' : 'Sign out'}
            </button>
            <div className="text-sm text-slate-500">
              Secure setup - Your data is encrypted in transit
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

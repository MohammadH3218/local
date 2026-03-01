'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function OnboardingIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/onboarding/setup');
  }, [router]);

  return (
    <div className="flex items-center justify-center py-20 text-sm text-slate-600">
      Redirecting to setup...
    </div>
  );
}

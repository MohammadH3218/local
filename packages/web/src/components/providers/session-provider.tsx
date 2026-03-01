'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { SessionProvider as NextAuthSessionProvider, useSession } from 'next-auth/react';
import { useAuthStore } from '@/stores/auth-store';

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const lastAuthCheckAt = useAuthStore((state) => state._lastAuthCheckAt);
  const { status } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const shouldCheck =
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/onboarding');

    if (shouldCheck && status === 'authenticated') {
      if (!isAuthenticated) {
        checkAuth();
        return;
      }
      if (!lastAuthCheckAt) {
        checkAuth();
      }
    } else {
      useAuthStore.setState({ isLoading: false, _checkAuthInProgress: false });
    }
  }, [checkAuth, pathname, status, isAuthenticated, lastAuthCheckAt]);

  return <>{children}</>;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider refetchInterval={5 * 60} refetchOnWindowFocus={true}>
      <AuthInitializer>{children}</AuthInitializer>
    </NextAuthSessionProvider>
  );
}


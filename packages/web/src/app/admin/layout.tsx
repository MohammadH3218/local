'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { UserRole } from '@handycall/shared';
import { useAuthStore } from '@/stores/auth-store';
import { Logo } from '@/components/ui/logo';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { CompanySwitcher } from '@/components/admin/company-switcher';
import { useAdminCompanyStore } from '@/stores/admin-company-store';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();
  const { isAuthenticated, isLoading, userRole, checkAuth } = useAuthStore();
  const { companyId } = useAdminCompanyStore();
  const requiresCompany = Boolean(
    pathname &&
      ['/admin/calls', '/admin/appointments', '/admin/customers', '/admin/knowledge', '/admin/usage', '/admin/settings'].some(
        (route) => pathname.startsWith(route)
      )
  );

  useEffect(() => {
    if (status === 'authenticated') {
      void checkAuth();
    }
  }, [status, checkAuth]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || userRole !== UserRole.ADMIN) {
      router.replace('/admin/login');
      return;
    }
  }, [isAuthenticated, isLoading, router, userRole]);

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        <AdminSidebar />
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="border-b border-border bg-white/80 backdrop-blur">
            <div className="flex flex-col gap-4 px-4 py-4 md:px-6 lg:px-8">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="lg:hidden">
                    <Logo variant="icon" width={36} height={36} />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Admin CRM</p>
                    <h1 className="text-lg font-semibold text-foreground">
                      {pathname === '/admin' ? 'Overview' : 'Workspace'}
                    </h1>
                  </div>
                </div>
                <ProfileDropdown />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CompanySwitcher />
                <div className="text-xs text-muted-foreground">
                  Select a company to review calls, appointments, and settings.
                </div>
              </div>
            </div>
          </header>
          <main className="flex-1 space-y-6 px-4 py-6 md:px-6 lg:px-8">
            {requiresCompany && !companyId ? (
              <div className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-foreground">Select a company to begin</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Choose a company from the selector above to review calls, appointments, customers, and settings.
                </p>
              </div>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { apiClient } from '@/lib/api-client';
import { UserRole } from '@handycall/shared';

type OnboardingStatus = {
  profile: boolean;
  billing: boolean;
  companyProfile: boolean;
  serviceArea: boolean;
  knowledge: boolean;
  calendar: boolean;
  phone: boolean;
};

type OnboardingContextValue = {
  loading: boolean;
  isAuthenticated: boolean;
  userRole: UserRole | null;
  company: any | null;
  status: OnboardingStatus;
  knowledgeCount: number | null;
  companyNumber: string | null;
  refreshAll: () => Promise<void>;
  refreshKnowledge: () => Promise<void>;
  refreshCompanyNumber: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function hasActiveSubscription(company: any | null) {
  if (!company) return false;
  return Boolean(
    company.subscription_plan ||
      company.stripe_subscription_id ||
      (company.subscription_status &&
        (company.subscription_status === 'ACTIVE' || company.subscription_status === 'TRIALING')) ||
      (company.trial_ends_at && company.trial_ends_at > Date.now())
  );
}

function hasPricingProfileData(company: any | null) {
  const profile = company?.pricing_profile;
  if (!profile || typeof profile !== 'object') return false;
  return Object.values(profile).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean') return true;
    return false;
  });
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { company, isAuthenticated, isLoading, checkAuth, userRole, user, email } = useAuthStore();
  const [knowledgeCount, setKnowledgeCount] = useState<number | null>(null);
  const [companyNumber, setCompanyNumber] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  const refreshKnowledge = async () => {
    try {
      const data = await apiClient.getKnowledgeItems(undefined, undefined, 5);
      const items = Array.isArray(data) ? data : data?.items || [];
      setKnowledgeCount(items.length);
    } catch {
      setKnowledgeCount(0);
    }
  };

  const refreshCompanyNumber = async () => {
    try {
      const res: any = await apiClient.getMyTelephonyNumber();
      const phone =
        res?.phoneNumber ??
        res?.phone_number ??
        res?.data?.phoneNumber ??
        res?.data?.phone_number ??
        null;
      setCompanyNumber(phone || null);
    } catch {
      setCompanyNumber(null);
    }
  };

  const refreshAll = async () => {
    if (!isAuthenticated || userRole === UserRole.ADMIN) return;
    setDataLoading(true);
    try {
      await checkAuth();
      await Promise.all([refreshKnowledge(), refreshCompanyNumber()]);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated && userRole !== UserRole.ADMIN) {
      refreshAll();
    }
    if (!isAuthenticated) {
      setKnowledgeCount(null);
      setCompanyNumber(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoading, userRole]);

  const status = useMemo<OnboardingStatus>(() => {
    if (!company) {
      return {
        profile: false,
        billing: false,
        companyProfile: false,
        serviceArea: false,
        knowledge: false,
        calendar: false,
        phone: false,
      };
    }

    return {
      profile: Boolean((user?.first_name || user?.last_name) && (email || company.email)),
      billing: hasActiveSubscription(company),
      companyProfile: company.company_profile_completed === true,
      serviceArea: company.service_area_completed === true,
      knowledge: (knowledgeCount !== null ? knowledgeCount > 0 : false) || hasPricingProfileData(company),
      calendar: company.calendar_setup_completed === true,
      phone: Boolean(companyNumber),
    };
  }, [company, knowledgeCount, companyNumber, email, user?.first_name, user?.last_name]);

  const loading = isLoading || dataLoading;

  return (
    <OnboardingContext.Provider
      value={{
        loading,
        isAuthenticated,
        userRole,
        company,
        status,
        knowledgeCount,
        companyNumber,
        refreshAll,
        refreshKnowledge,
        refreshCompanyNumber,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
}

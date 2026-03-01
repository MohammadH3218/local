import { create } from 'zustand';
import { User, Company, UserRole } from '@handycall/shared';
import { apiClient } from '@/lib/api-client';
import { extractUserRole, decodeJWT } from '@/lib/jwt';
import { signOut } from 'next-auth/react';

interface AuthState {
  user: User | null;
  company: Company | null;
  accessToken: string | null;
  idToken: string | null;
  refreshToken: string | null;
  email: string | null;
  userRole: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  requiresPasswordChange: boolean;
  passwordChangeSession: string | null;
  passwordChangePoolType: 'users' | 'admin' | 'customer' | null;
  _checkAuthInProgress: boolean;
  _lastAuthCheckAt: number | null;

  // Actions
  login: (email: string, password: string) => Promise<{ requiresPasswordChange: boolean; userRole: UserRole | null }>;
  changePassword: (email: string, newPassword: string, session: string, poolType?: 'users' | 'admin' | 'customer', firstName?: string, lastName?: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  setTokens: (accessToken: string, idToken: string, refreshToken: string) => void;
  checkAuth: () => Promise<void>;
  setCompany: (company: Company | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  company: null,
  accessToken: null,
  idToken: null,
  refreshToken: null,
  email: null,
  userRole: null,
  isAuthenticated: false,
  isLoading: true,
  requiresPasswordChange: false,
  passwordChangeSession: null,
  passwordChangePoolType: null,
  _checkAuthInProgress: false,
  _lastAuthCheckAt: null,

  login: async (email: string, password: string) => {
    // Login is handled by NextAuth credentials; this store just tracks derived state.
    set({ isLoading: false });
    return { requiresPasswordChange: false, userRole: null };
  },

  changePassword: async (
    email: string,
    newPassword: string,
    session: string,
    poolType?: 'users' | 'admin' | 'customer',
    firstName?: string,
    lastName?: string,
  ) => {
    try {
      // Use provided poolType or get from store
      const poolTypeToUse = poolType || get().passwordChangePoolType || 'users';
      const response = await apiClient.changePassword(email, newPassword, session, poolTypeToUse, firstName, lastName);

      // Ensure response has required fields
      if (!response || !response.access_token) {
        throw new Error('Invalid password change response');
      }

      // Extract user role - check response first, then fall back to token extraction
      let userRole: UserRole | null = null;
      
      // Check if backend explicitly provided userRole
      if (response.userRole) {
        userRole = response.userRole as UserRole;
      } else if (response.id_token) {
        // Fall back to extracting from token
        userRole = extractUserRole(response.id_token);
      }

      // Set tokens after password change
      apiClient.setAccessToken(response.access_token);

      set({
        user: response.user || null,
        company: response.company || null,
        accessToken: response.access_token,
        idToken: response.id_token,
        refreshToken: response.refresh_token,
        email,
        userRole,
        isAuthenticated: true,
        isLoading: false,
        requiresPasswordChange: false,
        passwordChangeSession: null,
        passwordChangePoolType: null,
      });
    } catch (error: any) {
      set({ isLoading: false });
      // Re-throw with better error message if available
      if (error.message) {
        throw error;
      }
      throw new Error('Failed to change password. Please try again.');
    }
  },

  register: async (data: any) => {
    try {
      const response = await apiClient.register(data);

      set({
        email: response.email || data?.email || null,
        isAuthenticated: false,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    // Clear local client state
    apiClient.setAccessToken(null);

    if (typeof window !== 'undefined') {
      // Cleanup legacy auth keys that may still exist from previous builds.
      localStorage.removeItem('access_token');
      localStorage.removeItem('id_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('email');
      localStorage.removeItem('user_role');
      // Trigger NextAuth sign-out so server session is cleared
      await signOut({ callbackUrl: '/login' });
    }

    set({
      user: null,
      company: null,
      accessToken: null,
      idToken: null,
      refreshToken: null,
      email: null,
      userRole: null,
      isAuthenticated: false,
      isLoading: false,
      requiresPasswordChange: false,
      passwordChangeSession: null,
      passwordChangePoolType: null,
    });
  },

  setTokens: (accessToken: string, idToken: string, refreshToken: string) => {
    apiClient.setAccessToken(accessToken);

    set({
      accessToken,
      idToken,
      refreshToken,
    });
  },

  checkAuth: async () => {
    if (typeof window === 'undefined') {
      set({ isLoading: false });
      return;
    }

    // Prevent multiple simultaneous checkAuth calls
    const state = get();
    if (state._checkAuthInProgress) {
      return;
    }

    const now = Date.now();
    if (state.isAuthenticated && state._lastAuthCheckAt && now - state._lastAuthCheckAt < 10000) {
      // Avoid rechecking auth too frequently during normal navigation
      return;
    }

    const shouldShowLoading = !state.isAuthenticated;
    set({
      _checkAuthInProgress: true,
      isLoading: shouldShowLoading ? true : state.isLoading,
      isAuthenticated: shouldShowLoading ? false : state.isAuthenticated,
    });

    try {
      // Get NextAuth session info to populate user/email/role
      const sessionResponse = await fetch('/api/auth/session', { cache: 'no-store' });
      let session = sessionResponse.ok ? await sessionResponse.json() : null;

      const sessionRole =
        ((session as any)?.user?.role as UserRole | undefined) ||
        ((session as any)?.userRole as UserRole | undefined);
      const sessionPoolType = (session as any)?.poolType as 'users' | 'admin' | 'customer' | undefined;
      const derivedRole =
        sessionRole ||
        (sessionPoolType === 'admin' ? UserRole.ADMIN : undefined) ||
        UserRole.OWNER;
      const sessionEmail = (session as any)?.user?.email as string | undefined;
      const accessToken = (session as any)?.accessToken as string | undefined;
      const idToken = (session as any)?.idToken as string | undefined;
      const refreshToken = (session as any)?.refreshToken as string | undefined;
      const nameFromSession = (session as any)?.user?.name as string | undefined;
      const firstNameFromSession = (session as any)?.user?.given_name as string | undefined;
      const lastNameFromSession = (session as any)?.user?.family_name as string | undefined;
      const decoded = idToken ? decodeJWT(idToken) : null;
      const firstNameFromToken =
        decoded?.given_name ||
        decoded?.name?.split(' ')?.[0];
      const lastNameFromToken =
        decoded?.family_name ||
        decoded?.name?.split(' ')?.slice(1).join(' ');

      // If no session, user is not authenticated
      if (!session || (!accessToken && !idToken)) {
        // Clear any stale tokens
        if (typeof window !== 'undefined') {
          localStorage.removeItem('access_token');
          localStorage.removeItem('id_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('email');
          localStorage.removeItem('user_role');
        }
        set({
          isLoading: false,
          isAuthenticated: false,
          userRole: null,
          company: null,
          user: null,
          accessToken: null,
          idToken: null,
          refreshToken: null,
          email: null,
          _checkAuthInProgress: false,
          _lastAuthCheckAt: now,
        });
        return;
      }

      if (derivedRole === UserRole.ADMIN) {
        const email = sessionEmail || null;

        const userObj = session?.user
          ? ({
              email,
              first_name: firstNameFromSession || firstNameFromToken || nameFromSession,
              last_name: lastNameFromSession || lastNameFromToken || undefined,
            } as User)
          : null;

        set({
          company: null,
          user: userObj,
          email,
          userRole: UserRole.ADMIN,
          accessToken: accessToken || null,
          idToken: idToken || null,
          refreshToken: refreshToken || null,
          isAuthenticated: true,
          isLoading: false,
          _checkAuthInProgress: false,
          _lastAuthCheckAt: now,
        });
        return;
      }

      // Customer flow: hydrate auth immediately, then fetch company in background
      const email = sessionEmail || null;
      const userRole = derivedRole;
      const firstName =
        firstNameFromSession ||
        firstNameFromToken ||
        (session?.user as any)?.name?.split(' ')?.[0];
      const lastName =
        lastNameFromSession ||
        lastNameFromToken ||
        (session?.user as any)?.name?.split(' ')?.slice(1).join(' ');

      const user: Partial<User> | null = session?.user
        ? {
            email: session.user.email || undefined,
            first_name: firstName || undefined,
            last_name: lastName || undefined,
          }
        : null;

      set({
        company: null,
        user: (user as User) || null,
        email,
        userRole,
        accessToken: accessToken || null,
        idToken: idToken || null,
        refreshToken: refreshToken || null,
        isAuthenticated: true,
        isLoading: false,
        _checkAuthInProgress: false,
        _lastAuthCheckAt: now,
      });

      const hydrateCompany = async () => {
        try {
          const company = await apiClient.getMyCompany();
          set({ company });
        } catch (error: any) {
          if (
            error?.message?.includes('Company not found') ||
            error?.message?.includes('not completed company setup')
          ) {
            set({ company: null });
            return;
          }
        }
      };
      void hydrateCompany();

      return;
    } catch (error) {
      // Clear auth state and localStorage on authentication failure
      if (typeof window !== 'undefined') {
        localStorage.removeItem('access_token');
        localStorage.removeItem('id_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('email');
        localStorage.removeItem('user_role');
      }

      set({
        user: null,
        company: null,
        accessToken: null,
        idToken: null,
        refreshToken: null,
        email: null,
        userRole: null,
        isAuthenticated: false,
        isLoading: false,
        _checkAuthInProgress: false,
        _lastAuthCheckAt: now,
      });
    }
  },
  setCompany: (company: Company | null) => {
    set({ company });
  },
}));

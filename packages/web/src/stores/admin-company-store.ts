import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type AdminCompanyState = {
  companyId: string | null;
  companyName: string | null;
  setCompany: (companyId: string | null, companyName?: string | null) => void;
  clearCompany: () => void;
};

export const useAdminCompanyStore = create<AdminCompanyState>()(
  persist(
    (set) => ({
      companyId: null,
      companyName: null,
      setCompany: (companyId, companyName) =>
        set({ companyId: companyId || null, companyName: companyName || null }),
      clearCompany: () => set({ companyId: null, companyName: null }),
    }),
    {
      name: 'handycall-admin-company',
      partialize: (state) => ({ companyId: state.companyId, companyName: state.companyName }),
    }
  )
);

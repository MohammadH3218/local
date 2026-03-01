'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2 } from 'lucide-react';
import { useAdminCompanyStore } from '@/stores/admin-company-store';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type CompanyOption = {
  company_id: string;
  company_name: string;
  status?: string;
};

async function fetchCompanies(): Promise<CompanyOption[]> {
  const res = await fetch('/api/proxy/companies', { credentials: 'include' });
  if (!res.ok) {
    throw new Error('Failed to load companies');
  }
  return res.json();
}

export function CompanySwitcher() {
  const { companyId, companyName, setCompany } = useAdminCompanyStore();
  const [options, setOptions] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        const data = await fetchCompanies();
        if (!active) return;
        setOptions(data || []);
        if (!companyId && data?.length) {
          setCompany(data[0].company_id, data[0].company_name);
        }
      } catch (err) {
        // ignore, handled by empty state
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [companyId, setCompany]);

  const selected = useMemo(() => {
    if (!companyId) return null;
    return options.find((opt) => opt.company_id === companyId) || null;
  }, [companyId, options]);

  const label = selected?.company_name || companyName || 'Select company';

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-emerald-600" />
      <Select
        value={companyId || ''}
        onValueChange={(value) => {
          const next = options.find((opt) => opt.company_id === value);
          if (next) {
            setCompany(next.company_id, next.company_name);
          }
        }}
      >
        <SelectTrigger className="w-[260px] bg-white">
          <SelectValue
            placeholder={loading ? 'Loading companies...' : 'Select company'}
          >
            {label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 ? (
            <SelectItem value="__empty" disabled>
              {loading ? 'Loading companies...' : 'No companies found'}
            </SelectItem>
          ) : (
            options.map((opt) => (
              <SelectItem key={opt.company_id} value={opt.company_id}>
                {opt.company_name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

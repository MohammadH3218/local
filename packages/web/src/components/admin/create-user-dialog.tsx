'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { SERVICE_TYPE_OPTIONS } from '@/constants/service-types';
import { DEFAULT_TIMEZONE, TIMEZONE_OPTIONS } from '@/constants/timezones';

const USER_ROLES = [
  { value: 'OWNER', label: 'Owner' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'STAFF', label: 'Staff' },
];

const SERVICE_TYPES = SERVICE_TYPE_OPTIONS;

interface Company {
  company_id: string;
  company_name: string;
}

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  preselectedCompanyId?: string;
}

export function CreateUserDialog({ open, onOpenChange, onSuccess, preselectedCompanyId }: CreateUserDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [poolType, setPoolType] = useState<'users' | 'admin'>('users');
  const [formData, setFormData] = useState({
    company_id: preselectedCompanyId || '',
    company_name: '',
    company_service_type: '',
    company_email: '',
    company_timezone: DEFAULT_TIMEZONE,
    email: '',
    password: '',
    first_name: '',
    last_name: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    if (open) {
      loadCompanies();
    }
  }, [open]);

  useEffect(() => {
    if (preselectedCompanyId) {
      setFormData((prev) => ({ ...prev, company_id: preselectedCompanyId }));
    }
  }, [preselectedCompanyId]);

  const loadCompanies = async () => {
    try {
      const response = await fetch(`/api/proxy/companies`, { credentials: 'include' });

      if (response.ok) {
        const data = await response.json();
        setCompanies(data);
      }
    } catch (error) {
      console.error('Failed to load companies:', error);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    const creatingNewCompany = poolType === 'users' && !formData.company_id;

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      newErrors.password = 'Password must contain uppercase, lowercase, and number';
    }

    // Require full company details when creating a new company for a user
    if (creatingNewCompany) {
      if (!formData.company_name.trim()) {
        newErrors.company_name = 'Company name is required';
      }
      if (!formData.company_service_type) {
        newErrors.company_service_type = 'Service type is required';
      }
      if (!formData.company_email.trim()) {
        newErrors.company_email = 'Company email is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.company_email)) {
        newErrors.company_email = 'Invalid company email format';
      }
      if (!formData.company_timezone) {
        newErrors.company_timezone = 'Timezone is required';
      }
    }

    if (!formData.first_name.trim()) {
      newErrors.first_name = 'First name is required';
    }

    if (!formData.last_name.trim()) {
      newErrors.last_name = 'Last name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const payload: any = {
        pool_type: poolType,
        email: formData.email,
        password: formData.password,
        first_name: formData.first_name,
        last_name: formData.last_name,
      };

      // For customer users, include company info
      if (poolType === 'users') {
        if (formData.company_id) {
          payload.company_id = formData.company_id;
        } else {
          payload.company_name = formData.company_name;
          payload.company_service_type = formData.company_service_type;
          payload.company_email = formData.company_email;
          payload.company_timezone = formData.company_timezone;
        }
      }

      const response = await fetch(`/api/proxy/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const fields = (error as any)?.fields || {};
        setErrors((prev) => ({ ...prev, ...fields }));
        const topMessage =
          error.message ||
          Object.values(fields)[0] ||
          'Failed to create user';
        setServerError(topMessage);
        throw new Error(topMessage);
      }

      toast({
        title: 'Success',
        description: 'User created successfully',
      });

      setFormData({
        company_id: preselectedCompanyId || '',
        company_name: '',
        company_service_type: '',
        company_email: '',
        company_timezone: DEFAULT_TIMEZONE,
        email: '',
        password: '',
        first_name: '',
        last_name: '',
      });

      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create user',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New User</DialogTitle>
          <DialogDescription>
            Create a new user and associate them with a company.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {serverError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {serverError}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>User Type</Label>
              <Select
                value={poolType}
                onValueChange={(value) => {
                  setPoolType(value as 'users' | 'admin');
                  if (value === 'admin') {
                  setFormData((prev) => ({
                    ...prev,
                    company_id: '',
                    company_name: '',
                    company_service_type: '',
                    company_email: '',
                    company_timezone: DEFAULT_TIMEZONE,
                  }));
                }
              }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="users">Customer (users pool)</SelectItem>
                  <SelectItem value="admin">Platform Admin (admin pool)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {poolType === 'users' && (
              <>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="company_id">
                    Existing Company <span className="text-muted-foreground text-xs">(select if user belongs to existing company)</span>
                  </Label>
                  <Select
                    value={formData.company_id || undefined}
                    onValueChange={(value) => {
                      setFormData({
                        ...formData,
                        company_id: value,
                        company_name: '',
                        company_service_type: '',
                        company_email: '',
                        company_timezone: DEFAULT_TIMEZONE,
                      });
                    }}
                    disabled={!!preselectedCompanyId || !!formData.company_name}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select existing company (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          No companies available
                        </div>
                      ) : (
                        companies.map((company) => (
                          <SelectItem key={company.company_id} value={company.company_id}>
                            {company.company_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="company_name">
                    Or New Company Name <span className="text-muted-foreground text-xs">(enter to create new company)</span>
                  </Label>
                  <Input
                id="company_name"
                value={formData.company_name}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    company_name: e.target.value,
                    company_id: '',
                  });
                }}
                placeholder="Acme Inc."
                disabled={!!formData.company_id}
              />
              {errors.company_name && (
                <p className="text-sm text-destructive">{errors.company_name}</p>
              )}
            </div>

            {!formData.company_id && (
              <>
                <div className="grid gap-4 sm:grid-cols-2 sm:col-span-2">
                      <div className="space-y-2">
                        <Label htmlFor="company_service_type">Service Type</Label>
                        <Select
                          value={formData.company_service_type}
                          onValueChange={(value) => setFormData({ ...formData, company_service_type: value })}
                          disabled={!!formData.company_id}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select service type" />
                          </SelectTrigger>
                          <SelectContent>
                            {SERVICE_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors.company_service_type && (
                          <p className="text-sm text-destructive">{errors.company_service_type}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="company_email">Company Email</Label>
                        <Input
                          id="company_email"
                          type="email"
                          value={formData.company_email}
                          onChange={(e) => setFormData({ ...formData, company_email: e.target.value })}
                          placeholder="contact@company.com"
                          disabled={!!formData.company_id}
                        />
                        {errors.company_email && (
                          <p className="text-sm text-destructive">{errors.company_email}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 sm:col-span-2">
                      <div className="space-y-2">
                        <Label htmlFor="company_timezone">Timezone</Label>
                        <Select
                          value={formData.company_timezone}
                          onValueChange={(value) => setFormData({ ...formData, company_timezone: value })}
                          disabled={!!formData.company_id}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIMEZONE_OPTIONS.map((tz) => (
                              <SelectItem key={tz.value} value={tz.value}>
                                {tz.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors.company_timezone && (
                          <p className="text-sm text-destructive">{errors.company_timezone}</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="first_name">
                First Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                placeholder="John"
              />
              {errors.first_name && (
                <p className="text-sm text-destructive">{errors.first_name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="last_name">
                Last Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                placeholder="Doe"
              />
              {errors.last_name && (
                <p className="text-sm text-destructive">{errors.last_name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john.doe@company.com"
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                Password <span className="text-destructive">*</span>
              </Label>
              <Input
                id="password"
                type="text"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Strong password (min 8 chars, uppercase, lowercase, number)"
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password}</p>
              )}
              <p className="text-xs text-muted-foreground">
                User can change this password later in their settings.
              </p>
            </div>

          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

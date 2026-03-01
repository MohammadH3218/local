'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { SERVICE_TYPE_OPTIONS } from '@/constants/service-types';
import { DEFAULT_TIMEZONE, TIMEZONE_OPTIONS } from '@/constants/timezones';

interface CreateCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateCompanyDialog({ open, onOpenChange, onSuccess }: CreateCompanyDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    company_name: '',
    service_type: '',
    phone_number: '',
    email: '',
    timezone: DEFAULT_TIMEZONE,
    initial_admin_email: '',
    initial_admin_password: '',
    initial_admin_name: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.company_name.trim()) {
      newErrors.company_name = 'Company name is required';
    }

    if (!formData.service_type) {
      newErrors.service_type = 'Service type is required';
    }

    if (!formData.phone_number.trim()) {
      newErrors.phone_number = 'Phone number is required';
    } else if (!/^\+[1-9]\d{1,14}$/.test(formData.phone_number)) {
      newErrors.phone_number = 'Phone must be in E.164 format (e.g., +12345678900)';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    if (formData.initial_admin_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.initial_admin_email)) {
      newErrors.initial_admin_email = 'Invalid email format';
    }

    if (formData.initial_admin_password && formData.initial_admin_password.length < 8) {
      newErrors.initial_admin_password = 'Password must be at least 8 characters';
    }

    if (formData.initial_admin_password && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.initial_admin_password)) {
      newErrors.initial_admin_password = 'Password must contain uppercase, lowercase, and number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/proxy/companies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create company');
      }

      toast({
        title: 'Success',
        description: 'Company created successfully',
      });

      setFormData({
        company_name: '',
        service_type: '',
        phone_number: '',
        email: '',
        timezone: DEFAULT_TIMEZONE,
        initial_admin_email: '',
        initial_admin_password: '',
        initial_admin_name: '',
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create company',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Company</DialogTitle>
          <DialogDescription>
            Create a new company and optionally set up the initial admin user.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company_name">
                Company Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="company_name"
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                placeholder="ABC Plumbing"
              />
              {errors.company_name && (
                <p className="text-sm text-destructive">{errors.company_name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="service_type">
                Service Type <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.service_type}
                onValueChange={(value) => setFormData({ ...formData, service_type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select service type" />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPE_OPTIONS.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.service_type && (
                <p className="text-sm text-destructive">{errors.service_type}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone_number">
                Phone Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phone_number"
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                placeholder="+12345678900"
              />
              {errors.phone_number && (
                <p className="text-sm text-destructive">{errors.phone_number}</p>
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
                placeholder="contact@company.com"
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="timezone">
                Timezone <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.timezone}
                onValueChange={(value) => setFormData({ ...formData, timezone: value })}
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
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium mb-4">Initial Admin User (Optional)</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="initial_admin_name">Admin Name</Label>
                <Input
                  id="initial_admin_name"
                  value={formData.initial_admin_name}
                  onChange={(e) => setFormData({ ...formData, initial_admin_name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="initial_admin_email">Admin Email</Label>
                <Input
                  id="initial_admin_email"
                  type="email"
                  value={formData.initial_admin_email}
                  onChange={(e) => setFormData({ ...formData, initial_admin_email: e.target.value })}
                  placeholder="admin@company.com"
                />
                {errors.initial_admin_email && (
                  <p className="text-sm text-destructive">{errors.initial_admin_email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="initial_admin_password">Admin Password</Label>
                <Input
                  id="initial_admin_password"
                  type="password"
                  value={formData.initial_admin_password}
                  onChange={(e) => setFormData({ ...formData, initial_admin_password: e.target.value })}
                  placeholder="••••••••"
                />
                {errors.initial_admin_password && (
                  <p className="text-sm text-destructive">{errors.initial_admin_password}</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Company'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

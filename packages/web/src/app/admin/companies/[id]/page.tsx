'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { UserRole } from '@handycall/shared';
import { useAuthStore } from '@/stores/auth-store';
import { useAdminCompanyStore } from '@/stores/admin-company-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { SERVICE_TYPE_OPTIONS } from '@/constants/service-types';
import { DEFAULT_TIMEZONE, TIMEZONE_OPTIONS, hasTimezoneOption } from '@/constants/timezones';
import { PageHeader } from '@/components/portal/page-header';
import { ArrowLeft, Phone, Save, Search, AlertTriangle, XCircle, CheckCircle } from 'lucide-react';

type Company = {
  company_id: string;
  company_name: string;
  service_type: string;
  status: string;
  email: string;
  phone_number?: string;
  timezone: string;
  created_at: number;
  subscription_plan?: string;
  subscription_status?: string;
  cancel_at_period_end?: boolean;
  subscription_tier?: string;
  calls_enabled?: boolean;
  sms_enabled?: boolean;
};

type AvailableNumber = {
  phoneNumber: string;
  locality?: string;
  region?: string;
};

type CompanyNumber = {
  phoneNumber: string;
  provider?: string;
  label?: string;
} | null;

const SERVICE_TYPES = SERVICE_TYPE_OPTIONS;

const COMPANY_STATUSES: Array<{ value: string; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

async function fetchJsonFromProxy(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...(init || {}), credentials: 'include' });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed (${res.status})`);
  }

  return res.json();
}

export default function AdminCompanyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = useMemo(() => String((params as any)?.id || ''), [params]);
  const { userRole, isAuthenticated, isLoading } = useAuthStore();
  const { toast } = useToast();
  const { setCompany: setAdminCompany } = useAdminCompanyStore();

  const [company, setCompanyData] = useState<Company | null>(null);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [editData, setEditData] = useState<Partial<Company>>({});

  const [assignedNumber, setAssignedNumber] = useState<CompanyNumber>(null);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [numbersLoading, setNumbersLoading] = useState(false);
  const [numbersError, setNumbersError] = useState<string | null>(null);
  const [areaCode, setAreaCode] = useState('832');
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[]>([]);

  // Subscription management state
  const [isCanceling, setIsCanceling] = useState(false);
  const [isSuspending, setIsSuspending] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(false);
  const [showReactivateConfirm, setShowReactivateConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || userRole !== UserRole.ADMIN)) {
      router.push('/admin/login');
      return;
    }

    if (isAuthenticated && userRole === UserRole.ADMIN && companyId) {
      void loadCompany();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, userRole, isLoading, companyId]);

  const loadCompany = async () => {
    setIsPageLoading(true);
    try {
      const data = await fetchJsonFromProxy(`/api/proxy/companies/${companyId}`);
      setCompanyData(data);
      setAdminCompany(data.company_id, data.company_name);
      setEditData({
        company_name: data.company_name,
        service_type: data.service_type,
        email: data.email,
        phone_number: data.phone_number ?? '',
        timezone: data.timezone || DEFAULT_TIMEZONE,
        status: data.status,
        subscription_tier: (data as any).subscription_tier ?? '',
        calls_enabled: Boolean((data as any).calls_enabled),
        sms_enabled: Boolean((data as any).sms_enabled),
      });

      const numberRes = await fetchJsonFromProxy(`/api/proxy/admin/telephony/companies/${companyId}/number`);
      setAssignedNumber(numberRes?.data ?? null);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message || 'Failed to load company',
        variant: 'destructive',
      });
    } finally {
      setIsPageLoading(false);
    }
  };

  const saveCompanyDetails = async () => {
    try {
      setIsSavingCompany(true);
      const payload: any = {
        company_name: editData.company_name,
        service_type: editData.service_type,
        email: editData.email,
        phone_number: (editData.phone_number || '').trim() || undefined,
        timezone: editData.timezone,
        status: editData.status,
        subscription_tier: (editData.subscription_tier || '').trim() || undefined,
        calls_enabled: Boolean(editData.calls_enabled),
        sms_enabled: Boolean(editData.sms_enabled),
      };

      const updated = await fetchJsonFromProxy(`/api/proxy/companies/${companyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setCompanyData(updated);
      setShowSaveConfirm(false);
      toast({ title: 'Saved', description: 'Company details updated successfully.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to update company', variant: 'destructive' });
    } finally {
      setIsSavingCompany(false);
    }
  };

  const loadAvailableNumbers = async () => {
    try {
      setNumbersLoading(true);
      setNumbersError(null);
      const qs = new URLSearchParams();
      qs.set('country', 'US');
      qs.set('maxResults', '10');
      if (areaCode.trim()) qs.set('areaCode', areaCode.trim());

      const res = await fetchJsonFromProxy(`/api/proxy/admin/telephony/available-numbers?${qs.toString()}`);
      const list = Array.isArray(res?.data) ? res.data : [];
      setAvailableNumbers(list);
    } catch (err: any) {
      setNumbersError(err?.message || 'Failed to load available numbers');
      setAvailableNumbers([]);
    } finally {
      setNumbersLoading(false);
    }
  };

  const claimNumber = async (phoneNumber: string) => {
    try {
      setNumbersLoading(true);
      setNumbersError(null);

      const res = await fetchJsonFromProxy(`/api/proxy/admin/telephony/companies/${companyId}/claim-number`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });

      const claimed = res?.data?.phoneNumber ?? res?.data?.phone_number ?? phoneNumber;
      setAssignedNumber({ phoneNumber: claimed, provider: 'TWILIO' });
      setClaimDialogOpen(false);
      toast({ title: 'Success', description: `Claimed ${claimed} and routed to voice bridge.` });
    } catch (err: any) {
      setNumbersError(err?.message || 'Failed to claim number');
    } finally {
      setNumbersLoading(false);
    }
  };

  // Cancel subscription (at period end)
  const handleCancelSubscription = async () => {
    try {
      setIsCanceling(true);
      await fetchJsonFromProxy(`/api/proxy/admin/companies/${companyId}/cancel-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      setShowCancelConfirm(false);
      toast({ title: 'Subscription Canceled', description: 'The subscription will end at the current billing period.' });
      await loadCompany();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to cancel subscription', variant: 'destructive' });
    } finally {
      setIsCanceling(false);
    }
  };

  // Suspend subscription (immediately)
  const handleSuspendSubscription = async () => {
    try {
      setIsSuspending(true);
      await fetchJsonFromProxy(`/api/proxy/admin/companies/${companyId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      setShowSuspendConfirm(false);
      toast({ title: 'Account Suspended', description: 'The account has been suspended and services disabled.' });
      await loadCompany();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to suspend account', variant: 'destructive' });
    } finally {
      setIsSuspending(false);
    }
  };

  // Reactivate account
  const handleReactivateAccount = async () => {
    try {
      setIsReactivating(true);
      await fetchJsonFromProxy(`/api/proxy/companies/${companyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACTIVE' }),
      });
      setShowReactivateConfirm(false);
      toast({ title: 'Account Reactivated', description: 'The account is now active.' });
      await loadCompany();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to reactivate account', variant: 'destructive' });
    } finally {
      setIsReactivating(false);
    }
  };

  if (isLoading || isPageLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="space-y-6">
        <Button variant="outline" onClick={() => router.push('/admin/companies')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Companies
        </Button>
        <div className="text-sm text-muted-foreground">Company not found.</div>
      </div>
    );
  }

  const subscriptionStatus = String((company as any)?.subscription_status ?? '').toUpperCase();
  const cancelAtPeriodEnd = Boolean(
    (company as any)?.cancel_at_period_end ?? (company as any)?.subscription_cancel_at_period_end
  );
  const isCancelScheduled = cancelAtPeriodEnd || subscriptionStatus === 'CANCELING';

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        eyebrow="Company"
        title={company.company_name}
        subtitle="Update company details, subscription status, and phone routing."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push('/admin/companies')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Badge variant="outline">{company.status}</Badge>
          </div>
        }
      />

        <Card>
          <CardHeader>
            <CardTitle>Company details</CardTitle>
            <CardDescription>Update core company fields and service settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="company_name">Company name</Label>
                <Input
                  id="company_name"
                  value={editData.company_name ?? ''}
                  onChange={(e) => setEditData((p) => ({ ...p, company_name: e.target.value }))}
                  placeholder="Enter company name"
                />
              </div>

              <div className="space-y-2">
                <Label>Service type</Label>
                <Select
                  value={String(editData.service_type ?? '')}
                  onValueChange={(value) => setEditData((p) => ({ ...p, service_type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select service type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Company email</Label>
                <Input
                  id="email"
                  type="email"
                  value={editData.email ?? ''}
                  onChange={(e) => setEditData((p) => ({ ...p, email: e.target.value }))}
                  placeholder="company@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone_number">Business contact phone (E.164)</Label>
                <Input
                  id="phone_number"
                  value={String(editData.phone_number ?? '')}
                  onChange={(e) => setEditData((p) => ({ ...p, phone_number: e.target.value }))}
                  placeholder="+12345678900"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  value={String(editData.timezone ?? '')}
                  onValueChange={(value) => setEditData((p) => ({ ...p, timezone: value }))}
                >
                  <SelectTrigger id="timezone">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {!hasTimezoneOption(String(editData.timezone ?? '')) && editData.timezone ? (
                      <SelectItem value={String(editData.timezone)}>{String(editData.timezone)}</SelectItem>
                    ) : null}
                    {TIMEZONE_OPTIONS.map((timezone) => (
                      <SelectItem key={timezone.value} value={timezone.value}>
                        {timezone.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={String(editData.status ?? '')}
                  onValueChange={(value) => setEditData((p) => ({ ...p, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPANY_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subscription_tier">Subscription tier (internal)</Label>
                <Input
                  id="subscription_tier"
                  value={String(editData.subscription_tier ?? '')}
                  onChange={(e) => setEditData((p) => ({ ...p, subscription_tier: e.target.value }))}
                  placeholder="MAX"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editData.calls_enabled)}
                  onChange={(e) => setEditData((p) => ({ ...p, calls_enabled: e.target.checked }))}
                />
                Calls enabled
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editData.sms_enabled)}
                  onChange={(e) => setEditData((p) => ({ ...p, sms_enabled: e.target.checked }))}
                />
                SMS enabled
              </label>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setShowSaveConfirm(true)} disabled={isSavingCompany}>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Subscription & Service Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Subscription & Service Controls</CardTitle>
            <CardDescription>Manage subscription status and service availability.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Current Status */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 border">
              <div>
                <div className="text-sm font-medium text-gray-700">Account Status</div>
                <div className="flex items-center gap-2 mt-1">
                  {company?.status === 'ACTIVE' ? (
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                  ) : company?.status === 'SUSPENDED' ? (
                    <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                      <XCircle className="h-3 w-3 mr-1" />
                      Suspended
                    </Badge>
                  ) : company?.status === 'INACTIVE' ? (
                    <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Inactive
                    </Badge>
                  ) : (
                    <Badge variant="outline">{company?.status || 'Unknown'}</Badge>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500">Subscription Tier</div>
                <div className="font-medium">{company?.subscription_tier || 'None'}</div>
              </div>
            </div>

            {/* Service Controls */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-700">Service Controls</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-gray-500" />
                    <span className="text-sm">Calls</span>
                  </div>
                  <Badge variant={editData.calls_enabled ? 'default' : 'secondary'}>
                    {editData.calls_enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">SMS</span>
                  </div>
                  <Badge variant={editData.sms_enabled ? 'default' : 'secondary'}>
                    {editData.sms_enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Subscription Actions */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-700">Subscription Actions</h4>
              <div className="flex flex-wrap gap-3">
                {company?.status === 'SUSPENDED' || company?.status === 'INACTIVE' ? (
                  <Button variant="default" onClick={() => setShowReactivateConfirm(true)} disabled={isReactivating}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Reactivate Account
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      className="border-orange-300 text-orange-700 hover:bg-orange-50"
                      onClick={() => setShowCancelConfirm(true)}
                      disabled={isCanceling || isCancelScheduled}
                    >
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      {isCancelScheduled ? 'Cancellation Scheduled' : 'Cancel at Period End'}
                    </Button>
                    <Button
                      variant="outline"
                      className="border-red-300 text-red-700 hover:bg-red-50"
                      onClick={() => setShowSuspendConfirm(true)}
                      disabled={isSuspending}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Suspend Immediately
                    </Button>
                  </>
                )}
              </div>
              <p className="text-xs text-gray-500">
                "Cancel at Period End" allows the subscription to run until the current billing cycle ends.
                "Suspend Immediately" terminates services right away.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Telephony</CardTitle>
            <CardDescription>Assign a Twilio phone number to route inbound calls to the AI receptionist.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-gray-900">Assigned phone number</div>
                <div className="text-sm text-gray-600">{assignedNumber?.phoneNumber ?? 'Not assigned'}</div>
              </div>
              <Button
                onClick={() => {
                  setClaimDialogOpen(true);
                  void loadAvailableNumbers();
                }}
              >
                <Phone className="h-4 w-4 mr-2" />
                Claim phone number
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Claiming a number purchases it in Twilio (monthly fee) and automatically routes Voice to the voice bridge.
            </div>
          </CardContent>
        </Card>
      
      <Dialog open={claimDialogOpen} onOpenChange={setClaimDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Claim a Twilio phone number</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="areaCode">Area code (optional)</Label>
                <Input
                  id="areaCode"
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value)}
                  placeholder="e.g., 832"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={loadAvailableNumbers} disabled={numbersLoading}>
                  <Search className="h-4 w-4 mr-2" />
                  {numbersLoading ? 'Loading...' : 'Search'}
                </Button>
              </div>
            </div>

            {numbersError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">{numbersError}</div>
            )}

            <div className="border rounded-md divide-y">
              {numbersLoading ? (
                <div className="p-4 text-sm text-gray-600">Loading available numbers...</div>
              ) : availableNumbers.length ? (
                availableNumbers.map((n) => (
                  <div key={n.phoneNumber} className="p-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{n.phoneNumber}</div>
                      <div className="text-xs text-gray-500">
                        {[n.locality, n.region].filter(Boolean).join(', ') || 'US local'}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => claimNumber(n.phoneNumber)} disabled={numbersLoading}>
                      Claim
                    </Button>
                  </div>
                ))
              ) : (
                <div className="p-4 text-sm text-gray-600">No numbers found. Try a different area code.</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Subscription</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600">
              Are you sure you want to cancel this company's subscription? The account will remain active until the end of the current billing period.
            </p>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <p className="text-sm text-orange-800">
                <strong>Company:</strong> {company?.company_name}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCancelConfirm(false)} disabled={isCanceling}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="bg-orange-600 hover:bg-orange-700"
                onClick={handleCancelSubscription}
                disabled={isCanceling}
              >
                {isCanceling ? 'Canceling...' : 'Confirm Cancellation'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Suspend Confirmation Dialog */}
      <Dialog open={showSuspendConfirm} onOpenChange={setShowSuspendConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Suspend Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600">
              Are you sure you want to suspend this company's account? This will immediately disable all services including calls and SMS.
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">
                <strong>Warning:</strong> This action takes effect immediately. The company will lose access to all services.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSuspendConfirm(false)} disabled={isSuspending}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleSuspendSubscription} disabled={isSuspending}>
                {isSuspending ? 'Suspending...' : 'Suspend Account'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reactivate Confirmation Dialog */}
      <Dialog open={showReactivateConfirm} onOpenChange={setShowReactivateConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reactivate Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600">Reactivate this company and re-enable services?</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowReactivateConfirm(false)} disabled={isReactivating}>
                Cancel
              </Button>
              <Button onClick={handleReactivateAccount} disabled={isReactivating}>
                {isReactivating ? 'Reactivating...' : 'Confirm Reactivation'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save Confirmation Dialog */}
      <Dialog open={showSaveConfirm} onOpenChange={setShowSaveConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Changes</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600">
              Are you sure you want to save changes to this company's information?
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
              <p className="text-sm text-blue-800">
                <strong>Company:</strong> {editData.company_name}
              </p>
              <p className="text-sm text-blue-800">
                <strong>Status:</strong> {editData.status}
              </p>
              <p className="text-sm text-blue-800">
                <strong>Services:</strong> Calls {editData.calls_enabled ? 'Enabled' : 'Disabled'}, SMS {editData.sms_enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSaveConfirm(false)} disabled={isSavingCompany}>
                Cancel
              </Button>
              <Button onClick={saveCompanyDetails} disabled={isSavingCompany}>
                <Save className="h-4 w-4 mr-2" />
                {isSavingCompany ? 'Saving...' : 'Confirm Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

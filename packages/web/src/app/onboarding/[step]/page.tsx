'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { apiClient } from '@/lib/api-client';
import { useOnboarding } from '@/components/onboarding/onboarding-context';
import { ONBOARDING_STEPS, OnboardingStepId } from '@/constants/onboarding';
import { SERVICE_TYPE_OPTIONS } from '@/constants/service-types';
import { getServicePricingGuide } from '@/constants/service-pricing-guides';
import { CALL_HANDLING_OPTIONS, formatCallHandlingLabel } from '@/constants/call-handling';
import { PLAN_CATALOG, getPlanPriceDisplay } from '@/constants/plans';
import { DEFAULT_TIMEZONE, TIMEZONE_OPTIONS } from '@/constants/timezones';
import { useAuthStore } from '@/stores/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { CallForwardingGuide } from '@/components/telephony/call-forwarding-guide';
import { KnowledgeSetupAssistant } from '@/components/knowledge/knowledge-setup-assistant';
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  ExternalLink,
  MapPin,
  MessageSquare,
  Phone,
  Sparkles,
} from 'lucide-react';
import {
  CallHandlingMode,
  CompanyPricingLineItem,
  CompanyPricingModel,
  CompanyPricingProfile,
  ServiceType,
  SubscriptionPlan,
} from '@handycall/shared';

const CALENDAR_WEEKDAYS: Array<{ key: string; label: string; longKey: string }> = [
  { key: 'mon', label: 'Mon', longKey: 'monday' },
  { key: 'tue', label: 'Tue', longKey: 'tuesday' },
  { key: 'wed', label: 'Wed', longKey: 'wednesday' },
  { key: 'thu', label: 'Thu', longKey: 'thursday' },
  { key: 'fri', label: 'Fri', longKey: 'friday' },
  { key: 'sat', label: 'Sat', longKey: 'saturday' },
  { key: 'sun', label: 'Sun', longKey: 'sunday' },
];

type CalendarDayDraft = {
  closed: boolean;
  open: string;
  close: string;
};

type CalendarHoursDraft = Record<string, CalendarDayDraft>;

function normalizeCalendarHours(raw: any): CalendarHoursDraft {
  const output: CalendarHoursDraft = {};
  for (const day of CALENDAR_WEEKDAYS) {
    const candidate = raw?.[day.key] || raw?.[day.longKey] || {};
    const segments = Array.isArray(candidate?.segments) ? candidate.segments : [];
    const segment = segments.find((s: any) => s?.open && s?.close);
    const open = String(segment?.open || candidate?.open || '09:00');
    const close = String(segment?.close || candidate?.close || '17:00');
    const closed = candidate?.closed === true || !(segment || (candidate?.open && candidate?.close));
    output[day.key] = { closed, open, close };
  }
  return output;
}

function compactCalendarHours(draft: CalendarHoursDraft) {
  const result: Record<string, any> = {};
  for (const day of CALENDAR_WEEKDAYS) {
    const item = draft[day.key];
    if (!item || item.closed) {
      result[day.key] = { closed: true };
      continue;
    }
    result[day.key] = {
      closed: false,
      segments: [{ open: item.open, close: item.close }],
    };
  }
  return result;
}

const PRICING_MODEL_OPTIONS: Array<{
  value: CompanyPricingModel;
  label: string;
  description: string;
}> = [
  { value: 'FIXED', label: 'Fixed pricing', description: 'Flat pricing for common jobs.' },
  { value: 'HOURLY', label: 'Hourly pricing', description: 'Rate based on labor time.' },
  { value: 'SUBSCRIPTION', label: 'Subscription plans', description: 'Recurring plan tiers.' },
  { value: 'QUOTE_AFTER_INSPECTION', label: 'Quote after inspection', description: 'Final price after diagnostics.' },
  { value: 'MIXED', label: 'Mixed model', description: 'Combination of flat, hourly, or plans.' },
  { value: 'CUSTOM', label: 'Custom model', description: 'Special pricing structure.' },
];

const PRICING_KNOWLEDGE_TAG = 'onboarding:pricing-profile';
const PRICING_KNOWLEDGE_TITLE = 'Pricing and service model';

type CompanyStepFormState = {
  company_name: string;
  service_type: string;
  timezone: string;
  pricing_model: CompanyPricingModel | '';
  pricing_summary: string;
  estimate_policy: string;
  starting_price: string;
  service_call_fee: string;
  hourly_rate: string;
  minimum_charge: string;
  emergency_surcharge: string;
  tiers_text: string;
  add_ons_text: string;
  highlights_text: string;
  warranty_summary: string;
  notes: string;
  financing_available: boolean;
  prices_start_at_only: boolean;
};

function toCurrencyNumber(value: string): number | undefined {
  const trimmed = String(value || '').trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.replace(/[$,\s]/g, '');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function parseMultiline(value: string): string[] {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parsePricingLines(value: string): CompanyPricingLineItem[] {
  return parseMultiline(value)
    .map((line) => {
      const [nameRaw, priceRaw, detailsRaw] = line.split('|').map((part) => part?.trim() || '');
      if (!nameRaw) return null;
      const item: CompanyPricingLineItem = { name: nameRaw };
      if (priceRaw) item.price_label = priceRaw;
      if (detailsRaw) item.details = detailsRaw;
      return item;
    })
    .filter((item): item is CompanyPricingLineItem => Boolean(item));
}

function formatPricingLines(items?: CompanyPricingLineItem[]): string {
  if (!Array.isArray(items) || items.length === 0) return '';
  return items
    .map((item) => [item.name, item.price_label, item.details].filter(Boolean).join(' | '))
    .join('\n');
}

function hasPricingProfileData(profile: CompanyPricingProfile | null | undefined): boolean {
  if (!profile || typeof profile !== 'object') return false;
  const keys = Object.keys(profile).filter((key) => key !== 'currency' && key !== 'updated_at');
  for (const key of keys) {
    const value = (profile as Record<string, unknown>)[key];
    if (Array.isArray(value) && value.length > 0) return true;
    if (typeof value === 'number' && Number.isFinite(value)) return true;
    if (typeof value === 'boolean') return true;
    if (typeof value === 'string' && value.trim()) return true;
  }
  return false;
}

function extractCompanyFormState(company: any): CompanyStepFormState {
  const profile = (company?.pricing_profile || {}) as CompanyPricingProfile;
  return {
    company_name: company?.company_name || '',
    service_type: String(company?.service_type || ''),
    timezone: company?.timezone || DEFAULT_TIMEZONE,
    pricing_model: (profile.model as CompanyPricingModel | undefined) || '',
    pricing_summary: profile.summary || '',
    estimate_policy: profile.estimate_policy || '',
    starting_price:
      typeof profile.starting_price === 'number' && Number.isFinite(profile.starting_price)
        ? String(profile.starting_price)
        : '',
    service_call_fee:
      typeof profile.service_call_fee === 'number' && Number.isFinite(profile.service_call_fee)
        ? String(profile.service_call_fee)
        : '',
    hourly_rate:
      typeof profile.hourly_rate === 'number' && Number.isFinite(profile.hourly_rate)
        ? String(profile.hourly_rate)
        : '',
    minimum_charge:
      typeof profile.minimum_charge === 'number' && Number.isFinite(profile.minimum_charge)
        ? String(profile.minimum_charge)
        : '',
    emergency_surcharge:
      typeof profile.emergency_surcharge === 'number' && Number.isFinite(profile.emergency_surcharge)
        ? String(profile.emergency_surcharge)
        : '',
    tiers_text: formatPricingLines(profile.tiers),
    add_ons_text: formatPricingLines(profile.add_ons),
    highlights_text: Array.isArray(profile.plan_highlights) ? profile.plan_highlights.join('\n') : '',
    warranty_summary: profile.warranty_summary || '',
    notes: profile.notes || '',
    financing_available: profile.financing_available === true,
    prices_start_at_only: profile.prices_start_at_only === true,
  };
}

function buildPricingProfile(form: CompanyStepFormState): CompanyPricingProfile | null {
  const profile: CompanyPricingProfile = {
    currency: 'USD',
    updated_at: Date.now(),
  };

  if (form.pricing_model) profile.model = form.pricing_model;
  if (form.pricing_summary.trim()) profile.summary = form.pricing_summary.trim();
  if (form.estimate_policy.trim()) profile.estimate_policy = form.estimate_policy.trim();
  if (form.warranty_summary.trim()) profile.warranty_summary = form.warranty_summary.trim();
  if (form.notes.trim()) profile.notes = form.notes.trim();

  const startingPrice = toCurrencyNumber(form.starting_price);
  if (startingPrice !== undefined) profile.starting_price = startingPrice;
  const serviceCallFee = toCurrencyNumber(form.service_call_fee);
  if (serviceCallFee !== undefined) profile.service_call_fee = serviceCallFee;
  const hourlyRate = toCurrencyNumber(form.hourly_rate);
  if (hourlyRate !== undefined) profile.hourly_rate = hourlyRate;
  const minimumCharge = toCurrencyNumber(form.minimum_charge);
  if (minimumCharge !== undefined) profile.minimum_charge = minimumCharge;
  const emergencySurcharge = toCurrencyNumber(form.emergency_surcharge);
  if (emergencySurcharge !== undefined) profile.emergency_surcharge = emergencySurcharge;

  const tiers = parsePricingLines(form.tiers_text);
  if (tiers.length > 0) profile.tiers = tiers;

  const addOns = parsePricingLines(form.add_ons_text);
  if (addOns.length > 0) profile.add_ons = addOns;

  const highlights = parseMultiline(form.highlights_text);
  if (highlights.length > 0) profile.plan_highlights = highlights;

  if (form.financing_available) profile.financing_available = true;
  if (form.prices_start_at_only) profile.prices_start_at_only = true;

  return hasPricingProfileData(profile) ? profile : null;
}

function getServiceTypeLabel(value: string): string {
  const option = SERVICE_TYPE_OPTIONS.find((item) => item.value === value);
  return option?.label || 'your services';
}

function buildPricingKnowledgeContent(serviceTypeLabel: string, profile: CompanyPricingProfile): string {
  const lines: string[] = [];
  lines.push(`Pricing profile for ${serviceTypeLabel}:`);

  if (profile.model) lines.push(`- Pricing model: ${profile.model.replace(/_/g, ' ').toLowerCase()}.`);
  if (profile.summary) lines.push(`- Overview: ${profile.summary}`);
  if (typeof profile.starting_price === 'number') lines.push(`- Typical starting price: $${profile.starting_price}.`);
  if (typeof profile.service_call_fee === 'number') lines.push(`- Service/diagnostic call fee: $${profile.service_call_fee}.`);
  if (typeof profile.hourly_rate === 'number') lines.push(`- Hourly rate: $${profile.hourly_rate}.`);
  if (typeof profile.minimum_charge === 'number') lines.push(`- Minimum charge: $${profile.minimum_charge}.`);
  if (typeof profile.emergency_surcharge === 'number') lines.push(`- Emergency surcharge: $${profile.emergency_surcharge}.`);
  if (profile.estimate_policy) lines.push(`- Estimate policy: ${profile.estimate_policy}`);
  if (profile.prices_start_at_only) lines.push(`- Quote guidance: prices are starting points and final cost depends on scope.`);
  if (profile.financing_available) lines.push(`- Financing: available when eligible.`);
  if (profile.warranty_summary) lines.push(`- Warranty/guarantee: ${profile.warranty_summary}`);

  if (Array.isArray(profile.tiers) && profile.tiers.length > 0) {
    lines.push('- Plan tiers:');
    for (const tier of profile.tiers) {
      const detail = [tier.name, tier.price_label, tier.details].filter(Boolean).join(' - ');
      lines.push(`  - ${detail}`);
    }
  }

  if (Array.isArray(profile.add_ons) && profile.add_ons.length > 0) {
    lines.push('- Common add-ons:');
    for (const addOn of profile.add_ons) {
      const detail = [addOn.name, addOn.price_label, addOn.details].filter(Boolean).join(' - ');
      lines.push(`  - ${detail}`);
    }
  }

  if (Array.isArray(profile.plan_highlights) && profile.plan_highlights.length > 0) {
    lines.push(`- Key highlights: ${profile.plan_highlights.join('; ')}`);
  }

  if (profile.notes) lines.push(`- Internal notes for caller-facing responses: ${profile.notes}`);
  lines.push('- If exact scope is unknown, explain what affects final price and offer to schedule an estimate.');
  return lines.join('\n');
}

async function upsertPricingKnowledge(profile: CompanyPricingProfile, serviceTypeLabel: string) {
  if (!hasPricingProfileData(profile)) return;
  const existingRaw = await apiClient.getKnowledgeItems(undefined, undefined, 250);
  const items = Array.isArray(existingRaw) ? existingRaw : existingRaw?.items || [];
  const existing = items.find(
    (item: any) => Array.isArray(item?.tags) && item.tags.includes(PRICING_KNOWLEDGE_TAG)
  );
  const payload = {
    title: PRICING_KNOWLEDGE_TITLE,
    type: 'POLICY',
    tags: [PRICING_KNOWLEDGE_TAG, 'pricing', 'onboarding'],
    content: buildPricingKnowledgeContent(serviceTypeLabel, profile),
  };

  if (existing?.knowledge_id) {
    await apiClient.updateKnowledgeItem(existing.knowledge_id, payload);
    return;
  }

  await apiClient.createKnowledgeItem(payload);
}

export default function OnboardingStepPage() {
  const params = useParams();
  const stepParam = String((params as any)?.step || 'billing') as OnboardingStepId;
  const router = useRouter();

  const stepIndex = ONBOARDING_STEPS.findIndex((step) => step.id === stepParam);
  const nextStep = stepIndex >= 0 ? ONBOARDING_STEPS[stepIndex + 1]?.id : undefined;

  useEffect(() => {
    if (stepIndex === -1) {
      router.replace('/onboarding/billing');
    }
  }, [router, stepIndex]);

  if (stepIndex === -1) {
    return null;
  }

  const commonProps = { nextStep };

  switch (stepParam) {
    case 'profile':
      return <ProfileStep {...commonProps} />;
    case 'billing':
      return <BillingStep {...commonProps} />;
    case 'company':
      return <CompanyStep {...commonProps} />;
    case 'service-area':
      return <ServiceAreaStep {...commonProps} />;
    case 'knowledge':
      return <KnowledgeStep {...commonProps} />;
    case 'calendar':
      return <CalendarStep {...commonProps} />;
    case 'phone':
      return <PhoneStep {...commonProps} />;
    default:
      return null;
  }
}

function SectionHeading({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-8 flex flex-col gap-3">
      <div className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-100 px-4 py-1 text-xs font-semibold text-emerald-700">
        {icon}
        Guided step
      </div>
      <div>
        <h1 className="text-3xl font-display text-slate-900">{title}</h1>
        <p className="mt-2 text-slate-600">{subtitle}</p>
      </div>
    </div>
  );
}

function NextStepButton({
  nextStep,
  disabled,
}: {
  nextStep?: OnboardingStepId;
  disabled?: boolean;
}) {
  const router = useRouter();
  if (!nextStep) {
    return (
      <Button onClick={() => router.push('/dashboard')} disabled={disabled}>
        Go to dashboard
        <ChevronRight className="ml-2 h-4 w-4" />
      </Button>
    );
  }
  return (
    <Button onClick={() => router.push(`/onboarding/${nextStep}`)} disabled={disabled}>
      Continue
      <ChevronRight className="ml-2 h-4 w-4" />
    </Button>
  );
}

function ProfileStep({ nextStep }: { nextStep?: OnboardingStepId }) {
  const { user, email } = useAuthStore();
  const { toast } = useToast();
  const [fullName, setFullName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const emailMissing = !email || !email.includes('@');

  useEffect(() => {
    const existingName = [user?.first_name, user?.last_name].filter(Boolean).join(' ');
    if (!fullName && existingName) {
      setFullName(existingName);
    }
    if (!contactEmail && email) {
      setContactEmail(email);
    }
  }, [contactEmail, email, fullName, user?.first_name, user?.last_name]);

  const handleSave = async () => {
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      toast({
        title: 'Add your name',
        description: 'Please enter the name you want HandyCall to use.',
        variant: 'destructive',
      });
      return;
    }

    const nameParts = trimmedName.split(' ').filter(Boolean);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');

    const payload: { first_name?: string; last_name?: string; contact_email?: string } = {
      first_name: firstName,
      last_name: lastName || undefined,
    };

    if (emailMissing && contactEmail.trim()) {
      payload.contact_email = contactEmail.trim();
    }

    setSaving(true);
    try {
      await apiClient.updateMyProfile(payload);
      useAuthStore.setState((state) => ({
        user: state.user
          ? {
              ...state.user,
              first_name: firstName,
              last_name: lastName || state.user.last_name,
            }
          : state.user,
        email: state.email || (emailMissing ? contactEmail.trim() : state.email),
      }));
      toast({
        title: 'Profile saved',
        description: 'Thanks! You can continue your setup.',
      });
    } catch (err: any) {
      toast({
        title: 'Save failed',
        description: err?.message || 'Unable to update profile.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionHeading
        icon={<Sparkles className="h-4 w-4" />}
        title="Confirm your profile"
        subtitle="We use this to personalize your HandyCall greeting and follow-ups."
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Your details</CardTitle>
            <CardDescription>Confirm the name and contact email we should use.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Full name</Label>
              <Input
                id="profile-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jamie Owner"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                type="email"
                value={emailMissing ? contactEmail : email || ''}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="you@business.com"
                disabled={!emailMissing}
              />
              {!emailMissing && (
                <p className="text-xs text-slate-500">
                  Your Google account email is already connected. You can update it later in Settings if needed.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save profile'}
              </Button>
              <NextStepButton nextStep={nextStep} disabled={saving} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-100 bg-emerald-50/70">
          <CardHeader>
            <CardTitle>Why we ask</CardTitle>
            <CardDescription>Small details keep your customer experience consistent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-emerald-900">
            <p>Your name shows up in call summaries and appointment notes.</p>
            <p>We use your email for confirmations and important account updates.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BillingStep({ nextStep }: { nextStep?: OnboardingStepId }) {
  const { status, refreshAll, company } = useOnboarding();
  const { toast } = useToast();
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

  const currentPlan = (company?.subscription_plan as SubscriptionPlan | undefined) || undefined;
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(currentPlan || null);
  const [showPayment, setShowPayment] = useState(false);
  const [connectStatus, setConnectStatus] = useState<any>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'HANDYCALL_MANAGED' | 'SELF_MANAGED'>('SELF_MANAGED');
  const [savingPaymentMode, setSavingPaymentMode] = useState(false);

  useEffect(() => {
    const mode = String((company as any)?.booking_payment_mode || '').toUpperCase();
    setPaymentMode(
      mode === 'HANDYCALL_MANAGED' ||
        (!mode && ((company as any)?.booking_payment_enabled || (company as any)?.stripe_connect_account_id))
        ? 'HANDYCALL_MANAGED'
        : 'SELF_MANAGED',
    );
  }, [company]);

  useEffect(() => {
    if (selectedPlan) {
      setShowPayment(true);
    }
  }, [selectedPlan]);

  useEffect(() => {
    if (!status.billing) return;
    let isMounted = true;
    apiClient
      .getConnectStatus()
      .then((data) => {
        if (!isMounted) return;
        setConnectStatus(data || { connected: false });
      })
      .catch(() => {
        if (!isMounted) return;
        setConnectStatus({ connected: false });
      });
    return () => {
      isMounted = false;
    };
  }, [status.billing]);

  const connectCanCharge = Boolean(connectStatus?.charges_enabled);
  const connectCanPayout = Boolean(connectStatus?.payouts_enabled);
  const connectReady = Boolean(connectStatus?.connected && connectCanCharge && connectCanPayout);
  const connectIncomplete = Boolean(connectStatus?.connected && !connectReady);

  const startConnectOnboarding = async () => {
    try {
      setConnectBusy(true);
      const result = await apiClient.setupConnectAccount();
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      toast({
        title: 'Unable to start Connect',
        description: 'Try again from Settings if this continues.',
        variant: 'destructive',
      });
    } catch (error: any) {
      toast({
        title: 'Connect setup failed',
        description: error?.message || 'Unable to start Stripe Connect onboarding.',
        variant: 'destructive',
      });
    } finally {
      setConnectBusy(false);
    }
  };

  const savePaymentMode = async (mode: 'HANDYCALL_MANAGED' | 'SELF_MANAGED') => {
    try {
      setSavingPaymentMode(true);
      setPaymentMode(mode);
      await apiClient.updateMyCompany({
        booking_payment_mode: mode,
        booking_payment_enabled: mode === 'HANDYCALL_MANAGED',
      });
      await refreshAll();
      toast({
        title: 'Payment mode updated',
        description:
          mode === 'HANDYCALL_MANAGED'
            ? 'Customers can pay from booking links after Stripe Connect is set up.'
            : 'You are set to handle customer payments outside HandyCall.',
      });
    } catch (error: any) {
      toast({
        title: 'Unable to update payment mode',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingPaymentMode(false);
    }
  };

  if (status.billing) {
    return (
      <div>
        <SectionHeading
          icon={<CreditCard className="h-4 w-4" />}
          title="Subscription active"
          subtitle="Your plan is live. You're ready to continue setup."
        />
        <Card className="border-emerald-100 bg-emerald-50/70">
          <CardContent className="flex items-center gap-3 p-6">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-900">Billing is complete</p>
              <p className="text-sm text-emerald-800/80">
                Plan {currentPlan || 'active'} is attached to this account.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="mt-5 border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="text-base">Optional: customer payment setup</CardTitle>
            <CardDescription>
              Choose whether HandyCall should manage customer payments end-to-end, or your team handles payments separately.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => void savePaymentMode('HANDYCALL_MANAGED')}
                disabled={savingPaymentMode}
                className={`rounded-xl border p-4 text-left transition ${
                  paymentMode === 'HANDYCALL_MANAGED'
                    ? 'border-emerald-300 bg-emerald-50/70'
                    : 'border-slate-200 bg-white hover:border-emerald-200'
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">Managed in HandyCall (Recommended)</p>
                <p className="mt-1 text-xs text-slate-600">
                  AI sends booking links and customers pay there. Connect Stripe once (bank/payout details included) and HandyCall tracks payment status automatically.
                </p>
              </button>
              <button
                type="button"
                onClick={() => void savePaymentMode('SELF_MANAGED')}
                disabled={savingPaymentMode}
                className={`rounded-xl border p-4 text-left transition ${
                  paymentMode === 'SELF_MANAGED'
                    ? 'border-slate-400 bg-slate-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">I handle payments myself</p>
                <p className="mt-1 text-xs text-slate-600">
                  HandyCall focuses on calls and bookings while your team invoices or charges customers separately.
                </p>
              </button>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-600">
              Process: customer chooses service on call or booking form, AI sends booking link, customer pays there when managed mode is enabled.
            </div>
            {paymentMode === 'HANDYCALL_MANAGED' ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <p className="text-sm text-slate-600">
                  {connectReady
                    ? 'Stripe Connect is fully configured.'
                    : connectIncomplete
                      ? 'Stripe Connect started but still needs charge/payout setup.'
                      : 'Stripe Connect is not configured yet.'}
                </p>
                <Button onClick={startConnectOnboarding} disabled={connectBusy}>
                  {connectBusy ? 'Opening…' : connectStatus?.connected ? 'Complete Connect setup' : 'Set up Connect'}
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-600">
                You can switch this later in Settings if you decide to collect payments through booking links.
              </div>
            )}
          </CardContent>
        </Card>
        <div className="mt-8 flex justify-end">
          <NextStepButton nextStep={nextStep} disabled={!status.billing} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeading
        icon={<CreditCard className="h-4 w-4" />}
        title="Activate your subscription"
        subtitle="Pick a plan and add a payment method. Setup continues after billing is active."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {Object.entries(PLAN_CATALOG).map(([plan, details]) => {
          const planKey = plan as SubscriptionPlan;
          const price = getPlanPriceDisplay(planKey);
          const isSelected = selectedPlan === planKey;
          const description =
            planKey === SubscriptionPlan.MAX
              ? 'Maximum monthly capacity with advanced routing.'
              : planKey === SubscriptionPlan.PRO
              ? 'Best for growing teams with steady call volume.'
              : 'Great for solo operators getting started.';
          return (
            <Card
              key={plan}
              className={`cursor-pointer border transition-all ${
                isSelected ? 'border-emerald-400 bg-emerald-50/70 shadow-md' : 'border-emerald-100 hover:border-emerald-200'
              }`}
              onClick={() => setSelectedPlan(planKey)}
            >
              <CardHeader>
                <CardTitle className="text-lg">{details.name}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold text-slate-900">{price.current}</span>
                  <span className="text-sm text-slate-500">{price.cadence}</span>
                </div>
                {details.trialLabel && (
                  <p className="mt-2 text-xs font-medium text-emerald-700">{details.trialLabel}</p>
                )}
                <ul className="mt-4 space-y-2 text-sm text-slate-600">
                  {details.featureHighlights.slice(0, 4).map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-8 border-emerald-100 bg-white">
        <CardHeader>
          <CardTitle>Payment method</CardTitle>
          <CardDescription>
            Add a card to activate the plan. Your card is secured by Stripe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!stripePromise ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              Stripe publishable key is missing. Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to continue.
            </div>
          ) : (
            <Elements stripe={stripePromise}>
              <OnboardingPaymentForm
                selectedPlan={selectedPlan}
                onSuccess={async () => {
                  await refreshAll();
                  toast({
                    title: 'Subscription activated',
                    description: 'Billing is set. Continue to the next step.',
                  });
                }}
              />
            </Elements>
          )}
        </CardContent>
      </Card>

      {showPayment && (
        <div className="mt-8 flex justify-end">
          <NextStepButton nextStep={nextStep} disabled={!status.billing} />
        </div>
      )}
    </div>
  );
}

function OnboardingPaymentForm({
  selectedPlan,
  onSuccess,
}: {
  selectedPlan: SubscriptionPlan | null;
  onSuccess: () => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !selectedPlan) return;

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    setLoading(true);
    setError(null);

    try {
      const { client_secret } = await apiClient.createSetupIntent();
      const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(client_secret, {
        payment_method: { card: cardElement },
      });

      if (stripeError) {
        throw new Error(stripeError.message);
      }

      if (!setupIntent?.payment_method) {
        throw new Error('No payment method returned from Stripe');
      }

      await apiClient.createSubscription({
        plan: selectedPlan,
        payment_method_id: setupIntent.payment_method as string,
      });

      setSuccess(true);
      await onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Unable to activate subscription.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-sm text-emerald-900">
        {selectedPlan
          ? `Selected plan: ${PLAN_CATALOG[selectedPlan].name}`
          : 'Select a plan above to unlock payment.'}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <CardElement
          options={{
            style: {
              base: {
                color: '#1f2937',
                fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
                fontSize: '16px',
                '::placeholder': { color: '#9ca3af' },
              },
              invalid: { color: '#ef4444' },
            },
          }}
        />
      </div>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Subscription activated.
        </div>
      )}
      <Button type="submit" disabled={!selectedPlan || !stripe || loading || success} className="w-full">
        {loading ? 'Processing...' : 'Activate subscription'}
      </Button>
    </form>
  );
}

function CompanyStep({ nextStep }: { nextStep?: OnboardingStepId }) {
  const { company, refreshAll, status } = useOnboarding();
  const { setCompany } = useAuthStore();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CompanyStepFormState>(() => extractCompanyFormState(company));

  useEffect(() => {
    setForm(extractCompanyFormState(company));
  }, [company]);

  const selectedServiceType = (form.service_type || company?.service_type || '') as ServiceType | '';
  const serviceGuide = getServicePricingGuide(selectedServiceType || undefined);
  const serviceTypeLabel = getServiceTypeLabel(form.service_type);
  const pricingProfile = buildPricingProfile(form);

  const handleSave = async () => {
    if (!form.company_name.trim() || !form.service_type) {
      toast({
        title: 'Missing details',
        description: 'Add a company name and service type to continue.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const updated = await apiClient.updateMyCompany({
        company_name: form.company_name.trim(),
        service_type: form.service_type,
        timezone: form.timezone,
        pricing_profile: pricingProfile || {},
        company_profile_completed: true,
      });
      setCompany(updated);

      if (pricingProfile) {
        try {
          await upsertPricingKnowledge(pricingProfile, serviceTypeLabel);
        } catch (knowledgeError) {
          console.warn('[Onboarding] Failed to sync pricing knowledge', knowledgeError);
        }
      }

      await refreshAll();
      toast({
        title: 'Company profile saved',
        description: pricingProfile
          ? 'Great! Company and pricing context are ready.'
          : 'Great! Let’s move to your service area.',
      });
    } catch (err: any) {
      toast({
        title: 'Update failed',
        description: err?.message || 'Unable to save company details.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionHeading
        icon={<Sparkles className="h-4 w-4" />}
        title="Tell us about your company"
        subtitle="Set your business type and pricing style so the AI gives accurate, realistic answers."
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Company details</CardTitle>
            <CardDescription>
              Core profile fields are required. Pricing personalization is optional and can be updated later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company name</Label>
              <Input
                id="company_name"
                value={form.company_name}
                onChange={(e) => setForm((prev) => ({ ...prev, company_name: e.target.value }))}
                placeholder="BrightPath Plumbing"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service_type">Company type</Label>
              <Select
                value={form.service_type}
                onValueChange={(value) => setForm((prev) => ({ ...prev, service_type: value }))}
              >
                <SelectTrigger id="service_type">
                  <SelectValue placeholder="Select company type" />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Primary timezone</Label>
              <Select value={form.timezone} onValueChange={(value) => setForm((prev) => ({ ...prev, timezone: value }))}>
                <SelectTrigger id="timezone">
                  <SelectValue placeholder="Select timezone" />
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
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
              <p className="text-sm font-semibold text-emerald-900">Pricing personalization (optional)</p>
              <p className="mt-1 text-xs text-emerald-800/80">
                Fill what you know today. Leave the rest blank. HandyCall will still work and you can refine this later.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pricing_model">Pricing model</Label>
              <Select
                value={form.pricing_model || 'NONE'}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    pricing_model: value === 'NONE' ? '' : (value as CompanyPricingModel),
                  }))
                }
              >
                <SelectTrigger id="pricing_model">
                  <SelectValue placeholder="Select pricing model (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Not set yet</SelectItem>
                  {PRICING_MODEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.pricing_model && (
                <p className="text-xs text-slate-500">
                  {PRICING_MODEL_OPTIONS.find((option) => option.value === form.pricing_model)?.description}
                </p>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="starting_price">Starting price (USD)</Label>
                <Input
                  id="starting_price"
                  inputMode="decimal"
                  value={form.starting_price}
                  onChange={(e) => setForm((prev) => ({ ...prev, starting_price: e.target.value }))}
                  placeholder="e.g., 129"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="service_call_fee">Service/diagnostic fee (USD)</Label>
                <Input
                  id="service_call_fee"
                  inputMode="decimal"
                  value={form.service_call_fee}
                  onChange={(e) => setForm((prev) => ({ ...prev, service_call_fee: e.target.value }))}
                  placeholder="e.g., 79"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hourly_rate">Hourly rate (USD)</Label>
                <Input
                  id="hourly_rate"
                  inputMode="decimal"
                  value={form.hourly_rate}
                  onChange={(e) => setForm((prev) => ({ ...prev, hourly_rate: e.target.value }))}
                  placeholder="e.g., 120"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minimum_charge">Minimum charge (USD)</Label>
                <Input
                  id="minimum_charge"
                  inputMode="decimal"
                  value={form.minimum_charge}
                  onChange={(e) => setForm((prev) => ({ ...prev, minimum_charge: e.target.value }))}
                  placeholder="e.g., 99"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="emergency_surcharge">Emergency surcharge (USD)</Label>
                <Input
                  id="emergency_surcharge"
                  inputMode="decimal"
                  value={form.emergency_surcharge}
                  onChange={(e) => setForm((prev) => ({ ...prev, emergency_surcharge: e.target.value }))}
                  placeholder="e.g., 50"
                />
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <Button
                type="button"
                variant={form.prices_start_at_only ? 'default' : 'outline'}
                onClick={() => setForm((prev) => ({ ...prev, prices_start_at_only: !prev.prices_start_at_only }))}
              >
                {form.prices_start_at_only ? 'Uses starting prices' : 'Set prices as starting-from'}
              </Button>
              <Button
                type="button"
                variant={form.financing_available ? 'default' : 'outline'}
                onClick={() => setForm((prev) => ({ ...prev, financing_available: !prev.financing_available }))}
              >
                {form.financing_available ? 'Financing available' : 'Mark financing availability'}
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pricing_summary">Pricing summary for callers</Label>
              <Textarea
                id="pricing_summary"
                value={form.pricing_summary}
                onChange={(e) => setForm((prev) => ({ ...prev, pricing_summary: e.target.value }))}
                placeholder="Explain your pricing in plain language."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimate_policy">Estimate policy</Label>
              <Textarea
                id="estimate_policy"
                value={form.estimate_policy}
                onChange={(e) => setForm((prev) => ({ ...prev, estimate_policy: e.target.value }))}
                placeholder="Example: Final quote provided after onsite inspection."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tiers_text">Plan tiers (optional, one per line)</Label>
              <Textarea
                id="tiers_text"
                value={form.tiers_text}
                onChange={(e) => setForm((prev) => ({ ...prev, tiers_text: e.target.value }))}
                placeholder={'Starter | $39/month | Exterior treatment every 30 days\nPro | $79/month | Interior + exterior + priority support'}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add_ons_text">Add-ons (optional, one per line)</Label>
              <Textarea
                id="add_ons_text"
                value={form.add_ons_text}
                onChange={(e) => setForm((prev) => ({ ...prev, add_ons_text: e.target.value }))}
                placeholder={'Rodent exclusion | $199 | Includes sealing entry points\nYard treatment | $49/visit | Perimeter spray'}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="highlights_text">Pricing highlights (optional, one per line)</Label>
              <Textarea
                id="highlights_text"
                value={form.highlights_text}
                onChange={(e) => setForm((prev) => ({ ...prev, highlights_text: e.target.value }))}
                placeholder={'No long-term contract required\nFree re-treatment within 14 days'}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="warranty_summary">Warranty/guarantee summary (optional)</Label>
              <Textarea
                id="warranty_summary"
                value={form.warranty_summary}
                onChange={(e) => setForm((prev) => ({ ...prev, warranty_summary: e.target.value }))}
                placeholder="Example: 30-day workmanship guarantee on repairs."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pricing_notes">Additional caller-facing notes (optional)</Label>
              <Textarea
                id="pricing_notes"
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Any details the AI should mention when asked about pricing."
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save company profile'}
              </Button>
              <NextStepButton nextStep={nextStep} disabled={!status.companyProfile} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-100 bg-emerald-50/70">
          <CardHeader>
            <CardTitle>{serviceGuide.headline}</CardTitle>
            <CardDescription>{serviceGuide.intro}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-emerald-900">
            <p>HandyCall uses your company type to tailor intake and booking logic for {serviceTypeLabel}.</p>
            <p>Timezone ensures bookings land in the correct business day and local time.</p>
            <div>
              <p className="font-semibold">Common caller questions</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {serviceGuide.pricingQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold">Good details to provide</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {serviceGuide.suggestedDetails.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white/70 p-3">
              <p className="font-semibold">Tip</p>
              <p className="mt-1 text-emerald-800/80">
                Pricing lines support this format: <code>Name | Price label | Notes</code>.
              </p>
            </div>
            {pricingProfile && (
              <div className="rounded-xl border border-emerald-200 bg-white/70 p-3 text-emerald-800/90">
                Pricing details will also be synced into your knowledge base so callers get consistent answers.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ServiceAreaStep({ nextStep }: { nextStep?: OnboardingStepId }) {
  const { company, refreshAll, status } = useOnboarding();
  const { setCompany } = useAuthStore();
  const { toast } = useToast();
  const [zipCodes, setZipCodes] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [zipInput, setZipInput] = useState('');
  const [cityInput, setCityInput] = useState('');
  const [serveEverywhere, setServeEverywhere] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (company) {
      const zips = (company.service_area_zipcodes as string[]) || [];
      const cityList = (company.service_area_cities as string[]) || [];
      setZipCodes(zips);
      setCities(cityList);
      setServeEverywhere(company.service_area_completed === true && zips.length === 0 && cityList.length === 0);
    }
  }, [company]);

  const addZip = () => {
    const value = zipInput.trim();
    if (!value) return;
    if (!/^\d{5}$/.test(value)) {
      toast({
        title: 'Invalid zip code',
        description: 'Enter a 5-digit zip code.',
        variant: 'destructive',
      });
      return;
    }
    if (zipCodes.includes(value)) return;
    setZipCodes((prev) => [...prev, value]);
    setZipInput('');
  };

  const addCity = () => {
    const value = cityInput.trim();
    if (!value) return;
    if (cities.includes(value)) return;
    setCities((prev) => [...prev, value]);
    setCityInput('');
  };

  const handleSave = async () => {
    if (!serveEverywhere && zipCodes.length === 0 && cities.length === 0) {
      toast({
        title: 'Add a service area',
        description: 'Enter at least one zip code or city, or choose to serve all areas.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const updates = {
        service_area_zipcodes: serveEverywhere ? [] : zipCodes,
        service_area_cities: serveEverywhere ? [] : cities,
        service_area_completed: true,
      };
      const updated = await apiClient.updateMyCompany(updates);
      setCompany(updated);
      await refreshAll();
      toast({
        title: 'Service area saved',
        description: 'Great! Let’s build your knowledge base.',
      });
    } catch (err: any) {
      toast({
        title: 'Save failed',
        description: err?.message || 'Unable to save service area.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionHeading
        icon={<MapPin className="h-4 w-4" />}
        title="Where do you provide service?"
        subtitle="We’ll use this to qualify inbound callers quickly."
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Service area</CardTitle>
            <CardDescription>Add cities and zip codes you cover.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-900">Serve all areas</p>
                  <p className="text-xs text-emerald-800/80">Choose this if you accept every zip code.</p>
                </div>
                <Button
                  type="button"
                  variant={serveEverywhere ? 'default' : 'outline'}
                  onClick={() => setServeEverywhere((prev) => !prev)}
                >
                  {serveEverywhere ? 'Selected' : 'Use all areas'}
                </Button>
              </div>
            </div>

            {!serveEverywhere && (
              <>
                <div>
                  <Label htmlFor="zipInput">Add zip codes</Label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      id="zipInput"
                      value={zipInput}
                      onChange={(e) => setZipInput(e.target.value)}
                      placeholder="e.g., 77002"
                      maxLength={5}
                    />
                    <Button type="button" variant="outline" onClick={addZip}>
                      Add
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {zipCodes.map((zip) => (
                      <Badge key={zip} className="bg-white text-slate-700">
                        {zip}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="cityInput">Add cities</Label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      id="cityInput"
                      value={cityInput}
                      onChange={(e) => setCityInput(e.target.value)}
                      placeholder="Austin, TX"
                    />
                    <Button type="button" variant="outline" onClick={addCity}>
                      Add
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {cities.map((city) => (
                      <Badge key={city} className="bg-white text-slate-700">
                        {city}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save service area'}
              </Button>
              <NextStepButton nextStep={nextStep} disabled={!status.serviceArea} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-100 bg-emerald-50/70">
          <CardHeader>
            <CardTitle>Why it matters</CardTitle>
            <CardDescription>Set expectations before a call ends.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-emerald-900">
            <p>
              HandyCall instantly checks coverage so customers know if they’re in range.
            </p>
            <p>
              Zip codes are used for automated qualification. Cities are shown to your team for context.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KnowledgeStep({ nextStep }: { nextStep?: OnboardingStepId }) {
  const { company, knowledgeCount, refreshKnowledge, status } = useOnboarding();
  const { toast } = useToast();
  const serviceTypeLabel = getServiceTypeLabel(String(company?.service_type || ''));
  const companyPricingProfile = (company?.pricing_profile || null) as CompanyPricingProfile | null;
  const pricingProfileReady = hasPricingProfileData(companyPricingProfile);
  const [form, setForm] = useState({
    title: '',
    content: '',
    type: 'FAQ',
  });
  const [saving, setSaving] = useState(false);
  const [syncingPricing, setSyncingPricing] = useState(false);

  const quickStarts = [
    {
      title: PRICING_KNOWLEDGE_TITLE,
      content: pricingProfileReady && companyPricingProfile
        ? buildPricingKnowledgeContent(serviceTypeLabel, companyPricingProfile)
        : `Share how ${serviceTypeLabel} pricing works, including starting prices, service fees, and when final quotes depend on inspection.`,
      type: 'POLICY',
    },
    {
      title: 'What services do you offer?',
      content: 'List your core services, add-ons, and any specialty work you handle.',
      type: 'SERVICE',
    },
    {
      title: 'Frequently asked questions',
      content: 'Include common questions you hear from customers and how you usually answer them.',
      type: 'FAQ',
    },
  ];

  const handleSyncPricingProfile = async () => {
    if (!pricingProfileReady || !companyPricingProfile) {
      toast({
        title: 'No pricing profile yet',
        description: 'Add pricing details in Company profile first, then sync here.',
        variant: 'destructive',
      });
      return;
    }

    setSyncingPricing(true);
    try {
      await upsertPricingKnowledge(companyPricingProfile, serviceTypeLabel);
      await refreshKnowledge();
      toast({
        title: 'Pricing knowledge synced',
        description: 'Your pricing profile was added to the knowledge base.',
      });
    } catch (err: any) {
      toast({
        title: 'Sync failed',
        description: err?.message || 'Unable to sync pricing profile.',
        variant: 'destructive',
      });
    } finally {
      setSyncingPricing(false);
    }
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast({
        title: 'Add details',
        description: 'Include a title and response before saving.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      await apiClient.createKnowledgeItem({
        title: form.title.trim(),
        content: form.content.trim(),
        type: form.type,
      });
      setForm({ title: '', content: '', type: 'FAQ' });
      await refreshKnowledge();
      toast({
        title: 'Knowledge added',
        description: 'Your AI can now answer more accurately.',
      });
    } catch (err: any) {
      toast({
        title: 'Save failed',
        description: err?.message || 'Unable to save knowledge item.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionHeading
        icon={<MessageSquare className="h-4 w-4" />}
        title="Build your knowledge base"
        subtitle="Add pricing, service details, and FAQs. The AI handles general questions automatically."
      />

      <div className="space-y-6">
        <KnowledgeSetupAssistant
          onImported={refreshKnowledge}
          title="AI knowledge interview"
          description="Answer guided follow-up questions. HandyCall will generate organized knowledge entries you can edit anytime."
        />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Add a knowledge entry</CardTitle>
            <CardDescription>
              Add entries for policies and FAQs. Pricing from company setup can be synced automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-sm">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <span>{knowledgeCount ?? 0} knowledge items added</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={handleSyncPricingProfile} disabled={syncingPricing || !pricingProfileReady}>
                {syncingPricing ? 'Syncing pricing...' : 'Sync pricing profile'}
              </Button>
              {!pricingProfileReady && (
                <p className="text-xs text-slate-500 self-center">
                  Add optional pricing details in Company profile to enable one-click sync.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(value) => setForm((prev) => ({ ...prev, type: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FAQ">FAQ</SelectItem>
                  <SelectItem value="SERVICE">Service</SelectItem>
                  <SelectItem value="POLICY">Policy</SelectItem>
                  <SelectItem value="PRODUCT">Product</SelectItem>
                  <SelectItem value="SAFETY">Safety</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Do you offer emergency service?"
              />
            </div>

            <div className="space-y-2">
              <Label>Answer</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                placeholder="Share the response you want HandyCall to use."
                rows={5}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {quickStarts.map((item) => (
                <Button
                  key={item.title}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setForm({ title: item.title, content: item.content, type: item.type })}
                >
                  {item.title}
                </Button>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Add knowledge'}
              </Button>
              <NextStepButton nextStep={nextStep} disabled={!status.knowledge} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-100 bg-emerald-50/70">
          <CardHeader>
            <CardTitle>What to include</CardTitle>
            <CardDescription>Focus on things only you know.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-emerald-900">
            <p>Pricing ranges, trip fees, and how estimates are handled.</p>
            <p>Service coverage details, response times, and booking rules.</p>
            <p>Answers to objections like “Do you guarantee your work?”</p>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}

function CalendarStep({ nextStep }: { nextStep?: OnboardingStepId }) {
  const { company, status, refreshAll } = useOnboarding();
  const { setCompany } = useAuthStore();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'GOOGLE' | 'MICROSOFT' | 'APPLE' | null>(null);
  const [showAppleForm, setShowAppleForm] = useState(false);
  const [appleEmail, setAppleEmail] = useState('');
  const [applePassword, setApplePassword] = useState('');
  const [calendarModeChoice, setCalendarModeChoice] = useState<'INTERNAL' | 'EXTERNAL'>(
    company?.calendar_mode === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL'
  );
  const [calendarTimezone, setCalendarTimezone] = useState(company?.timezone || DEFAULT_TIMEZONE);
  const [calendarHoursDraft, setCalendarHoursDraft] = useState<CalendarHoursDraft>(() =>
    normalizeCalendarHours(company?.business_hours)
  );

  useEffect(() => {
    setCalendarModeChoice(company?.calendar_mode === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL');
    setCalendarTimezone(company?.timezone || DEFAULT_TIMEZONE);
    setCalendarHoursDraft(normalizeCalendarHours(company?.business_hours));
  }, [company]);

  const hasHoursConfigured = CALENDAR_WEEKDAYS.some((day) => !calendarHoursDraft[day.key]?.closed);
  const scheduleSetupComplete = Boolean(calendarTimezone) && hasHoursConfigured;

  const calendarStatusLabel =
    company?.calendar_provider && company.calendar_provider !== 'NONE'
      ? `Connected to ${company.calendar_provider}`
      : status.calendar
      ? 'HandyCall calendar active'
      : 'Not connected yet';

  const persistScheduleSetup = async (mode: 'INTERNAL' | 'EXTERNAL', options?: { calendarReady?: boolean }) => {
    const updates: any = {
      calendar_mode: mode,
      timezone: calendarTimezone,
      business_hours: compactCalendarHours(calendarHoursDraft),
      schedule_setup_completed: scheduleSetupComplete,
      calendar_setup_completed: options?.calendarReady === true,
    };
    if (mode === 'INTERNAL') updates.calendar_provider = 'NONE';
    return apiClient.updateMyCompany(updates);
  };

  const handleUseInternal = async () => {
    if (!scheduleSetupComplete) {
      toast({
        title: 'Set hours first',
        description: 'Choose your timezone and at least one open day before continuing.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const updated = await persistScheduleSetup('INTERNAL', { calendarReady: true });
      setCompany(updated);
      await refreshAll();
      toast({
        title: 'Calendar ready',
        description: 'HandyCall calendar is active.',
      });
    } catch (err: any) {
      toast({
        title: 'Update failed',
        description: err?.message || 'Unable to update calendar settings.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async () => {
    if (!selectedProvider) {
      toast({
        title: 'Select a provider',
        description: 'Choose a calendar provider to continue.',
        variant: 'destructive',
      });
      return;
    }
    if (!scheduleSetupComplete) {
      toast({
        title: 'Set hours first',
        description: 'Choose your timezone and at least one open day before connecting a calendar.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    if (selectedProvider === 'APPLE') {
      try {
        await persistScheduleSetup('EXTERNAL', { calendarReady: false });
      } catch (err: any) {
        toast({
          title: 'Setup failed',
          description: err?.message || 'Unable to save schedule settings.',
          variant: 'destructive',
        });
        setSaving(false);
        return;
      }
      setSaving(false);
      setShowAppleForm(true);
      return;
    }
    try {
      await persistScheduleSetup('EXTERNAL', { calendarReady: false });
      const res =
        selectedProvider === 'GOOGLE'
          ? await apiClient.getGoogleCalendarAuthUrl()
          : await apiClient.getMicrosoftCalendarAuthUrl();
      if (res?.url) {
        window.location.href = res.url;
      }
    } catch (err: any) {
      toast({
        title: 'Connection failed',
        description: err?.message || 'Unable to start calendar connection.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConnectApple = async () => {
    if (!scheduleSetupComplete) {
      toast({
        title: 'Set hours first',
        description: 'Choose your timezone and at least one open day before connecting Apple Calendar.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      await persistScheduleSetup('EXTERNAL', { calendarReady: false });
      await apiClient.connectAppleCalendar(appleEmail, applePassword);
      await refreshAll();
      toast({
        title: 'Apple Calendar connected',
        description: 'Your calendar is now synced.',
      });
      setDialogOpen(false);
      setShowAppleForm(false);
      setAppleEmail('');
      setApplePassword('');
    } catch (err: any) {
      toast({
        title: 'Apple Calendar failed',
        description: err?.message || 'Unable to connect Apple Calendar.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionHeading
        icon={<Calendar className="h-4 w-4" />}
        title="Connect your calendar"
        subtitle="Choose how bookings should be managed."
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Calendar setup</CardTitle>
            <CardDescription>{calendarStatusLabel}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Calendar mode</Label>
              <div className="grid gap-2 md:grid-cols-2">
                <Button
                  type="button"
                  variant={calendarModeChoice === 'INTERNAL' ? 'default' : 'outline'}
                  onClick={() => setCalendarModeChoice('INTERNAL')}
                >
                  Use HandyCall calendar
                </Button>
                <Button
                  type="button"
                  variant={calendarModeChoice === 'EXTERNAL' ? 'default' : 'outline'}
                  onClick={() => setCalendarModeChoice('EXTERNAL')}
                >
                  Connect existing calendar
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="calendar-timezone">Timezone</Label>
              <Select value={calendarTimezone} onValueChange={setCalendarTimezone}>
                <SelectTrigger id="calendar-timezone">
                  <SelectValue placeholder="Select timezone" />
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

            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-sm font-semibold text-slate-900">Open/closed hours</p>
              <p className="mt-1 text-xs text-slate-600">Set at least one open day so callers can book valid times.</p>
              <div className="mt-4 space-y-3">
                {CALENDAR_WEEKDAYS.map((day) => {
                  const row = calendarHoursDraft[day.key] || { closed: true, open: '09:00', close: '17:00' };
                  return (
                    <div key={day.key} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900">{day.label}</p>
                        <Button
                          type="button"
                          size="sm"
                          variant={row.closed ? 'outline' : 'default'}
                          onClick={() =>
                            setCalendarHoursDraft((prev) => ({
                              ...prev,
                              [day.key]: { ...row, closed: !row.closed },
                            }))
                          }
                        >
                          {row.closed ? 'Closed' : 'Open'}
                        </Button>
                      </div>
                      {!row.closed && (
                        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
                          <Input
                            type="time"
                            value={row.open}
                            onChange={(e) =>
                              setCalendarHoursDraft((prev) => ({
                                ...prev,
                                [day.key]: { ...row, open: e.target.value || '09:00' },
                              }))
                            }
                          />
                          <span className="text-center text-sm text-slate-500">to</span>
                          <Input
                            type="time"
                            value={row.close}
                            onChange={(e) =>
                              setCalendarHoursDraft((prev) => ({
                                ...prev,
                                [day.key]: { ...row, close: e.target.value || '17:00' },
                              }))
                            }
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-900">
              {calendarModeChoice === 'INTERNAL'
                ? 'Use HandyCall calendar for fastest setup and built-in booking automation.'
                : 'Connect Google, Outlook, or Apple if you already manage your schedule there.'}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleUseInternal} disabled={saving || calendarModeChoice !== 'INTERNAL'}>
                Save and use HandyCall calendar
              </Button>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(true)}
                disabled={saving || calendarModeChoice !== 'EXTERNAL'}
              >
                Save and connect calendar
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <NextStepButton nextStep={nextStep} disabled={!status.calendar} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-100 bg-emerald-50/70">
          <CardHeader>
            <CardTitle>What happens next</CardTitle>
            <CardDescription>Stay in control of your schedule.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-emerald-900">
            <p>HandyCall checks availability and confirms bookings automatically.</p>
            <p>You can adjust working hours and booking windows later in Appointments.</p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Connect a calendar</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {['GOOGLE', 'MICROSOFT', 'APPLE'].map((provider) => (
              <button
                key={provider}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  selectedProvider === provider ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'
                }`}
                onClick={() => setSelectedProvider(provider as any)}
              >
                <div className="font-semibold text-slate-900">
                  {provider === 'GOOGLE'
                    ? 'Google Calendar'
                    : provider === 'MICROSOFT'
                    ? 'Outlook / Microsoft 365'
                    : 'Apple iCloud Calendar'}
                </div>
                <div className="text-sm text-slate-600">
                  {provider === 'GOOGLE'
                    ? 'Connect your Google/Gmail calendar'
                    : provider === 'MICROSOFT'
                    ? 'Connect your Outlook calendar'
                    : 'Use an app-specific password'}
                </div>
              </button>
            ))}
          </div>

          {showAppleForm ? (
            <div className="mt-4 space-y-3 border-t pt-4">
              <Label>Apple ID Email</Label>
              <Input value={appleEmail} onChange={(e) => setAppleEmail(e.target.value)} />
              <Label>App-Specific Password</Label>
              <Input
                value={applePassword}
                onChange={(e) => setApplePassword(e.target.value)}
                type="password"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowAppleForm(false)}>
                  Back
                </Button>
                <Button onClick={handleConnectApple} disabled={!appleEmail || !applePassword}>
                  Connect
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleConnect} disabled={!selectedProvider}>
                Connect
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PhoneStep({ nextStep }: { nextStep?: OnboardingStepId }) {
  const { company, companyNumber, refreshCompanyNumber, refreshAll, status } = useOnboarding();
  const { setCompany } = useAuthStore();
  const { toast } = useToast();
  const [currentNumber, setCurrentNumber] = useState(company?.phone_number || '');
  const [areaCode, setAreaCode] = useState('832');
  const [searchTerm, setSearchTerm] = useState('');
  const [availableNumbers, setAvailableNumbers] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [demoClaiming, setDemoClaiming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transferEnabled, setTransferEnabled] = useState(company?.transfer_enabled ?? false);
  const [transferNumber, setTransferNumber] = useState(company?.transfer_number ?? '');
  const [transferMode, setTransferMode] = useState<'company' | 'custom'>(
    company?.transfer_number && company?.transfer_number === company?.phone_number ? 'company' : 'custom'
  );
  const [transferSaving, setTransferSaving] = useState(false);
  const [callHandlingMode, setCallHandlingMode] = useState<CallHandlingMode>(
    (company?.call_handling_mode as CallHandlingMode) || CallHandlingMode.ALWAYS
  );
  const [callHandlingSaving, setCallHandlingSaving] = useState(false);

  useEffect(() => {
    if (company?.phone_number) {
      setCurrentNumber(company.phone_number);
    }
    if (company) {
      setTransferEnabled(company.transfer_enabled ?? false);
      setTransferNumber(company.transfer_number ?? '');
      setTransferMode(
        company.transfer_number && company.transfer_number === company.phone_number ? 'company' : 'custom'
      );
      setCallHandlingMode((company.call_handling_mode as CallHandlingMode) || CallHandlingMode.ALWAYS);
    }
  }, [company]);

  const handleSearch = async () => {
    setSearching(true);
    try {
      const results = await apiClient.getAvailablePhoneNumbers({
        areaCode: areaCode.trim() || undefined,
        contains: searchTerm.trim() || undefined,
        maxResults: 10,
      });
      setAvailableNumbers(results || []);
    } catch (err: any) {
      toast({
        title: 'Search failed',
        description: err?.message || 'Unable to load phone numbers.',
        variant: 'destructive',
      });
    } finally {
      setSearching(false);
    }
  };

  const handleClaim = async (phoneNumber: string) => {
    setClaiming(phoneNumber);
    try {
      await apiClient.claimPhoneNumber(phoneNumber, 'HandyCall onboarding');
      await refreshCompanyNumber();
      await refreshAll();
      toast({
        title: 'Number claimed',
        description: `Your HandyCall line is ${phoneNumber}.`,
      });
    } catch (err: any) {
      toast({
        title: 'Claim failed',
        description: err?.message || 'Unable to claim number.',
        variant: 'destructive',
      });
    } finally {
      setClaiming(null);
    }
  };

  const handleClaimDemo = async () => {
    setDemoClaiming(true);
    try {
      const res = await apiClient.claimDemoPhoneNumber();
      const claimed =
        res?.phoneNumber ??
        res?.phone_number ??
        res?.data?.phoneNumber ??
        res?.data?.phone_number ??
        null;
      await refreshCompanyNumber();
      await refreshAll();
      toast({
        title: 'Demo number assigned',
        description: claimed ? `Your demo HandyCall line is ${claimed}.` : 'Your demo HandyCall line is ready.',
      });
    } catch (err: any) {
      toast({
        title: 'Demo assignment failed',
        description: err?.message || 'Unable to assign a demo number.',
        variant: 'destructive',
      });
    } finally {
      setDemoClaiming(false);
    }
  };

  const handleSaveForwarding = async () => {
    if (!currentNumber.trim()) {
      toast({
        title: 'Add your current number',
        description: 'Enter the number you want to forward to HandyCall.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const updated = await apiClient.updateMyCompany({ phone_number: currentNumber.trim() });
      setCompany(updated);
      toast({
        title: 'Number saved',
        description: 'Your current number is on file.',
      });
    } catch (err: any) {
      toast({
        title: 'Save failed',
        description: err?.message || 'Unable to save phone number.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTransfer = async () => {
    if (transferEnabled) {
      const target =
        transferMode === 'company' ? currentNumber.trim() : transferNumber.trim();
      if (!target) {
        toast({
          title: 'Add a forwarding number',
          description: 'Enter the number you want calls forwarded to.',
          variant: 'destructive',
        });
        return;
      }
    }
    setTransferSaving(true);
    try {
      const target =
        transferEnabled
          ? transferMode === 'company'
            ? currentNumber.trim()
            : transferNumber.trim()
          : '';
      const updated = await apiClient.updateMyCompany({
        transfer_enabled: transferEnabled,
        transfer_number: transferEnabled ? target : '',
      });
      setCompany(updated);
      toast({
        title: 'Transfer settings saved',
        description: transferEnabled ? 'Calls can be forwarded to a human when needed.' : 'Transfer is disabled.',
      });
    } catch (err: any) {
      toast({
        title: 'Save failed',
        description: err?.message || 'Unable to save transfer settings.',
        variant: 'destructive',
      });
    } finally {
      setTransferSaving(false);
    }
  };

  const handleSaveCallHandling = async () => {
    setCallHandlingSaving(true);
    try {
      const updated = await apiClient.updateMyCompany({
        call_handling_mode: callHandlingMode,
      });
      setCompany(updated);
      toast({
        title: 'Call handling saved',
        description: `HandyCall will follow: ${formatCallHandlingLabel(callHandlingMode)}.`,
      });
    } catch (err: any) {
      toast({
        title: 'Save failed',
        description: err?.message || 'Unable to save call handling preferences.',
        variant: 'destructive',
      });
    } finally {
      setCallHandlingSaving(false);
    }
  };

  return (
    <div>
      <SectionHeading
        icon={<Phone className="h-4 w-4" />}
        title="Go live with HandyCall"
        subtitle="Forward your existing number or use your HandyCall line directly."
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-900">
            <p className="font-semibold">Once you are happy with setup, it is time to go live.</p>
            <p className="mt-1">
              Forward calls from your current business line to your HandyCall number, or start using the HandyCall line
              directly. Choose whether we answer every call, only missed calls, or after-hours. Within minutes, every
              ring gets a response.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Call handling preference</CardTitle>
              <CardDescription>Tell HandyCall when to answer. You can change this later in Settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                {CALL_HANDLING_OPTIONS.map((option) => {
                  const selected = callHandlingMode === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`cursor-pointer rounded-xl border p-3 text-left transition ${
                        selected ? 'border-emerald-400 bg-emerald-50/70' : 'border-slate-200 bg-white/80'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="radio"
                          name="callHandlingMode"
                          className="mt-1 h-4 w-4 accent-emerald-600"
                          checked={selected}
                          onChange={() => setCallHandlingMode(option.value)}
                        />
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{option.label}</div>
                          <div className="text-xs text-slate-600">{option.description}</div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-xs text-emerald-900">
                This setting tells us how you want calls handled. Use the carrier forwarding steps below to put it into
                effect.
              </div>

              <Button onClick={handleSaveCallHandling} disabled={callHandlingSaving}>
                {callHandlingSaving ? 'Saving...' : 'Save call handling'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Use your current number</CardTitle>
              <CardDescription>Keep your existing line and forward calls to HandyCall.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forwardingNumber">Current business number</Label>
                <Input
                  id="forwardingNumber"
                  value={currentNumber}
                  onChange={(e) => setCurrentNumber(e.target.value)}
                  placeholder="+15551234567"
                />
              </div>
              <Button onClick={handleSaveForwarding} disabled={saving}>
                {saving ? 'Saving...' : 'Save forwarding number'}
              </Button>
              {companyNumber && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-900">
                  Forward calls from your carrier to <strong>{companyNumber}</strong> to let HandyCall answer for you.
                </div>
              )}
            </CardContent>
          </Card>

          <CallForwardingGuide forwardToNumber={companyNumber} callHandlingMode={callHandlingMode} />

          <Card>
            <CardHeader>
              <CardTitle>Transfer to a human (optional)</CardTitle>
              <CardDescription>Let HandyCall transfer callers to a live person when they ask.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-emerald-600"
                  checked={transferEnabled}
                  onChange={(e) => setTransferEnabled(e.target.checked)}
                />
                Enable live transfer
              </label>

              {transferEnabled && (
                <div className="space-y-3 rounded-xl border border-emerald-100 bg-white/70 p-4">
                  <div className="space-y-2">
                    <Label>Forwarding target</Label>
                    <div className="flex flex-col gap-2 text-sm text-slate-700">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="transferMode"
                          checked={transferMode === 'company'}
                          onChange={() => setTransferMode('company')}
                        />
                        Use my current business number
                        {currentNumber ? ` (${currentNumber})` : ''}
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="transferMode"
                          checked={transferMode === 'custom'}
                          onChange={() => setTransferMode('custom')}
                        />
                        Use a different number
                      </label>
                    </div>
                  </div>

                  {transferMode === 'custom' && (
                    <div className="space-y-2">
                      <Label htmlFor="transferNumber">Forwarding number</Label>
                      <Input
                        id="transferNumber"
                        value={transferNumber}
                        onChange={(e) => setTransferNumber(e.target.value)}
                        placeholder="+15551234567"
                      />
                    </div>
                  )}
                </div>
              )}

              <Button onClick={handleSaveTransfer} disabled={transferSaving}>
                {transferSaving ? 'Saving...' : 'Save transfer settings'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Use a demo HandyCall number</CardTitle>
              <CardDescription>Skip purchasing a line while you test the platform.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-900">
                Demo numbers are for setup/testing only and are not connected to real telephony.
              </div>
              <Button onClick={handleClaimDemo} disabled={demoClaiming || Boolean(companyNumber)}>
                {companyNumber ? 'Number already assigned' : demoClaiming ? 'Assigning...' : 'Use demo number'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Claim a new HandyCall number</CardTitle>
              <CardDescription>Pick a local number customers can call.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="areaCode">Area code</Label>
                  <Input
                    id="areaCode"
                    value={areaCode}
                    onChange={(e) => setAreaCode(e.target.value)}
                    placeholder="832"
                  />
                </div>
                <div>
                  <Label htmlFor="contains">Contains</Label>
                  <Input
                    id="contains"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="555"
                  />
                </div>
              </div>
              <Button variant="outline" onClick={handleSearch} disabled={searching}>
                {searching ? 'Searching...' : 'Search numbers'}
              </Button>

              <div className="space-y-2">
                {availableNumbers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-emerald-100 p-4 text-sm text-slate-500">
                    Search to see available numbers.
                  </div>
                ) : (
                  availableNumbers.map((number) => (
                    <div
                      key={number.phoneNumber}
                      className="flex items-center justify-between rounded-xl border border-emerald-100 bg-white/70 p-3"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">{number.phoneNumber}</p>
                        <p className="text-xs text-slate-500">
                          {number.locality || 'Local'} {number.region ? `• ${number.region}` : ''}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleClaim(number.phoneNumber)}
                        disabled={Boolean(claiming)}
                      >
                        {claiming === number.phoneNumber ? 'Claiming...' : 'Claim'}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-emerald-100 bg-emerald-50/70">
          <CardHeader>
            <CardTitle>Phone setup status</CardTitle>
            <CardDescription>{companyNumber ? 'HandyCall line active' : 'No line assigned yet'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className={`h-4 w-4 ${companyNumber ? 'text-emerald-600' : 'text-emerald-300'}`} />
              <span>HandyCall number: {companyNumber || 'Not assigned'}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>Call handling: {formatCallHandlingLabel(callHandlingMode)}</span>
            </div>
            <p>
              After you claim a number, you can forward calls or use it as your main business line.
            </p>
            <div className="pt-4">
              <NextStepButton nextStep={nextStep} disabled={!status.phone} />
            </div>
          </CardContent>
        </Card>
      </div>

      {status.phone && (
        <div className="mt-6 flex justify-end">
          <NextStepButton nextStep={nextStep} />
        </div>
      )}
    </div>
  );
}

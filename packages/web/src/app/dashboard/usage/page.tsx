'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { usePortalBasePath } from '@/lib/portal';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { SubscriptionPlan } from '@handycall/shared';
import { PLAN_CATALOG, getPlanPriceDisplay } from '@/constants/plans';
import { normalizeUsageResponse, resolvePlan, resolvePlanLimits } from '@/lib/billing-utils';
import { PageHeader } from '@/components/portal/page-header';
import { AlertTriangle, Clock3, MessageSquare, Users, CreditCard, FileText } from 'lucide-react';

type UsageMetrics = {
  period_start?: number;
  period_end?: number;
  call_minutes?: number;
  sms_count?: number;
  active_contacts?: number;
};

export default function UsagePage() {
  const router = useRouter();
  const basePath = usePortalBasePath();
  const isAdminPortal = basePath === '/admin';
  const billingRoot = isAdminPortal ? '/admin/subscriptions' : `${basePath}/billing`;
  const billingPlans = isAdminPortal ? '/admin/subscriptions' : `${billingRoot}/plans`;
  const billingPayment = isAdminPortal ? '/admin/subscriptions' : `${billingRoot}/payment-method`;
  const billingInvoices = isAdminPortal ? '/admin/subscriptions' : `${billingRoot}/invoices`;
  const { company } = useAuthStore();
  const [usage, setUsage] = useState<UsageMetrics | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlan | undefined>(
    company?.subscription_plan as SubscriptionPlan | undefined
  );
  const [planLimits, setPlanLimits] = useState<{ minutes: number; sms: number; contacts: number }>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUsage();
    const id = window.setInterval(loadUsage, 30000);
    const onVisibility = () => { if (!document.hidden) loadUsage(); };
    window.addEventListener('focus', loadUsage);
    document.addEventListener('visibilitychange', onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', loadUsage);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const loadUsage = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [usageData, subscription] = await Promise.all([
        apiClient.getUsageMetrics(),
        apiClient.getMySubscription().catch((err) => {
          console.warn('Failed to load subscription for usage view', err);
          return null;
        }),
      ]);
      const normalizedPlan =
        resolvePlan(company?.subscription_plan as SubscriptionPlan | undefined) ||
        resolvePlan(subscription?.subscription_plan as SubscriptionPlan | undefined);
      setUsage(normalizeUsageResponse(usageData, subscription));
      const limits = normalizedPlan
        ? resolvePlanLimits(normalizedPlan, usageData?.plan_limits) || PLAN_CATALOG[normalizedPlan].limits
        : undefined;
      setPlanLimits(limits);
      setSubscriptionPlan(normalizedPlan);
    } catch (err: any) {
      console.error('Failed to load usage', err);
      setError(err.message || 'Unable to load usage right now.');
    } finally {
      setIsLoading(false);
    }
  };

  const planDetails = subscriptionPlan ? PLAN_CATALOG[subscriptionPlan] : undefined;
  const priceDisplay = subscriptionPlan ? getPlanPriceDisplay(subscriptionPlan) : undefined;

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const calculateUsagePercentage = (used: number, limit?: number) => {
    if (!limit || limit === -1) return 0;
    return Math.min(Math.round((used / limit) * 100), 100);
  };

  const alerts = useMemo(() => {
    if (!planLimits || !usage) return [];
    return [
      { label: 'Call minutes', percent: calculateUsagePercentage(usage.call_minutes || 0, planLimits.minutes) },
      { label: 'SMS', percent: calculateUsagePercentage(usage.sms_count || 0, planLimits.sms) },
      { label: 'Contacts', percent: calculateUsagePercentage(usage.active_contacts || 0, planLimits.contacts) },
    ].filter((item) => item.percent >= 75 && item.percent < 100 && item.percent !== 0);
  }, [planLimits, usage]);

  const reachedLimits = useMemo(() => {
    if (!planLimits || !usage) return [];
    return [
      { label: 'Call minutes', percent: calculateUsagePercentage(usage.call_minutes || 0, planLimits.minutes) },
      { label: 'SMS', percent: calculateUsagePercentage(usage.sms_count || 0, planLimits.sms) },
      { label: 'Contacts', percent: calculateUsagePercentage(usage.active_contacts || 0, planLimits.contacts) },
    ].filter((item) => item.percent >= 100);
  }, [planLimits, usage]);

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-100" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Usage" title="Usage and limits" />
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
          <button onClick={loadUsage} className="ml-2 font-semibold underline">Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Usage"
        title="Usage and limits"
        subtitle="Monitor your call, SMS, and contact usage for the current billing period."
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => router.push(billingInvoices)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
            >
              <FileText className="h-3.5 w-3.5" />
              Invoices
            </button>
            <Button onClick={() => router.push(billingRoot)}>Billing</Button>
          </div>
        }
      />

      {/* Alerts */}
      {reachedLimits.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-900">Usage limit reached</p>
              <div className="mt-2 space-y-1">
                {reachedLimits.map((item) => (
                  <div key={item.label} className="flex items-center justify-between text-sm text-red-700">
                    <span>{item.label}</span>
                    <span className="font-semibold">{item.percent}% used</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-red-700">
                AI handling may pause until your period resets on {formatDate(usage?.period_end)}.
              </p>
              <button
                onClick={() => router.push(billingPlans)}
                className="mt-3 text-xs font-semibold text-red-800 underline hover:text-red-900"
              >
                Upgrade now →
              </button>
            </div>
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">Approaching plan limits</p>
              <div className="mt-2 space-y-1">
                {alerts.map((alert) => (
                  <div key={alert.label} className="flex items-center justify-between text-sm text-amber-700">
                    <span>{alert.label}</span>
                    <span className="font-semibold">{alert.percent}% used</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => router.push(billingPlans)}
                className="mt-3 text-xs font-semibold text-amber-800 underline hover:text-amber-900"
              >
                Review plans →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Period + Plan */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Current Period</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {usage ? `${formatDate(usage.period_start)} – ${formatDate(usage.period_end)}` : 'No usage recorded for this period.'}
            </p>
          </div>
          {planDetails ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-right">
              <p className="text-xs text-slate-500">Active plan</p>
              <p className="text-base font-bold text-slate-900">{planDetails.name}</p>
              <p className="text-xs text-slate-500">
                {priceDisplay?.original && <span className="mr-1 line-through">{priceDisplay.original}</span>}
                <span className="font-semibold text-slate-700">{priceDisplay?.current}</span>
                {priceDisplay?.cadence && <span className="ml-1">{priceDisplay.cadence}</span>}
              </p>
            </div>
          ) : (
            <Button onClick={() => router.push(billingPlans)}>Choose a plan</Button>
          )}
        </div>

        {/* Meters */}
        <div className="grid gap-0 divide-y divide-slate-50 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <UsageMeter
            label="Call minutes"
            used={usage?.call_minutes || 0}
            limit={planLimits?.minutes}
            icon={<Clock3 className="h-4 w-4 text-blue-600" />}
            iconBg="border-blue-100 bg-blue-50"
            accentColor="bg-blue-500"
            calculateUsagePercentage={calculateUsagePercentage}
            formatUsed={(v) => v.toFixed(1)}
            overageSuffix=" min over"
          />
          <UsageMeter
            label="SMS messages"
            used={usage?.sms_count || 0}
            limit={planLimits?.sms}
            icon={<MessageSquare className="h-4 w-4 text-emerald-600" />}
            iconBg="border-emerald-100 bg-emerald-50"
            accentColor="bg-emerald-500"
            calculateUsagePercentage={calculateUsagePercentage}
          />
          <UsageMeter
            label="Active contacts"
            used={usage?.active_contacts || 0}
            limit={planLimits?.contacts}
            icon={<Users className="h-4 w-4 text-violet-600" />}
            iconBg="border-violet-100 bg-violet-50"
            accentColor="bg-violet-500"
            calculateUsagePercentage={calculateUsagePercentage}
          />
        </div>
      </div>

      {/* Account health */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Keep your account on track</h2>
          <p className="mt-0.5 text-xs text-slate-500">Manage your subscription and payment details to avoid interruptions.</p>
        </div>
        <div className="grid gap-px bg-slate-50 sm:grid-cols-3">
          {[
            {
              icon: <CreditCard className="h-4 w-4 text-emerald-600" />,
              title: 'Payment method',
              desc: 'Keep your billing info up to date for uninterrupted service.',
              action: () => router.push(billingPayment),
              cta: 'Manage',
            },
            {
              icon: <Users className="h-4 w-4 text-emerald-600" />,
              title: 'Plan controls',
              desc: 'Upgrade or downgrade without leaving your dashboard.',
              action: () => router.push(billingPlans),
              cta: 'View plans',
            },
            {
              icon: <FileText className="h-4 w-4 text-emerald-600" />,
              title: 'Invoice history',
              desc: 'Access and download every invoice in one place.',
              action: () => router.push(billingInvoices),
              cta: 'See invoices',
            },
          ].map((item) => (
            <div key={item.title} className="flex flex-col gap-2 bg-white p-5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50">
                {item.icon}
              </div>
              <p className="text-sm font-semibold text-slate-900">{item.title}</p>
              <p className="text-xs text-slate-500 flex-1">{item.desc}</p>
              <button
                onClick={item.action}
                className="mt-1 self-start text-xs font-semibold text-emerald-700 hover:text-emerald-600 transition-colors"
              >
                {item.cta} →
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UsageMeter({
  label,
  used,
  limit,
  icon,
  iconBg,
  accentColor,
  calculateUsagePercentage,
  formatUsed,
  overageSuffix = ' over limit',
}: {
  label: string;
  used: number;
  limit?: number;
  icon: React.ReactNode;
  iconBg: string;
  accentColor: string;
  calculateUsagePercentage: (used: number, limit?: number) => number;
  formatUsed?: (value: number) => string;
  overageSuffix?: string;
}) {
  const percent = calculateUsagePercentage(used, limit);
  const barColor = percent >= 90 ? 'bg-red-500' : percent >= 75 ? 'bg-amber-500' : accentColor;
  const limitLabel = limit === undefined ? 'No plan' : limit === -1 ? 'Unlimited' : limit.toLocaleString();
  const usageDisplay = formatUsed ? formatUsed(used) : used.toLocaleString();
  const overage = typeof limit === 'number' && limit > 0 && used > limit ? used - limit : 0;
  const overageDisplay = formatUsed ? formatUsed(overage) : overage.toLocaleString();

  return (
    <div className="px-5 py-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${iconBg}`}>
            {icon}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-700">{label}</p>
            <p className="text-[11px] text-slate-400">Limit: {limitLabel}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-slate-900">{usageDisplay}</p>
          {overage > 0 ? (
            <p className="text-xs text-red-600">{overageDisplay}{overageSuffix}</p>
          ) : percent > 0 && limit !== -1 && limit !== undefined ? (
            <p className="text-xs text-slate-400">{percent}% used</p>
          ) : null}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

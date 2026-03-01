'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { SubscriptionPlan } from '@handycall/shared';
import { PLAN_CATALOG, getPlanPriceDisplay } from '@/constants/plans';
import { PageHeader } from '@/components/portal/page-header';

const PLANS = (Object.keys(PLAN_CATALOG) as SubscriptionPlan[]).map((plan) => {
  const details = PLAN_CATALOG[plan];
  return {
    plan,
    name: details.name,
    badge: details.badge,
    trialLabel: details.trialLabel,
    priceDisplay: getPlanPriceDisplay(plan),
    features: details.featureHighlights,
    description:
      plan === SubscriptionPlan.MAX
        ? 'For teams that want maximum monthly capacity and routing flexibility'
        : plan === SubscriptionPlan.PRO
        ? 'For growing businesses with consistent call and SMS volume'
        : 'For solo operators getting started with AI answering',
    popular: plan === SubscriptionPlan.PRO,
    isTopTier: plan === SubscriptionPlan.MAX,
  };
});

export default function BillingPlansPage() {
  const router = useRouter();
  const { company } = useAuthStore();
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processingPlan, setProcessingPlan] = useState<SubscriptionPlan | null>(null);
  const planOrder = [SubscriptionPlan.STARTER, SubscriptionPlan.PRO, SubscriptionPlan.MAX];

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      const data = await apiClient.getMySubscription();
      setSubscription(data);
    } catch (error) {
      console.error('Failed to load subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    const currentPlan =
      company?.subscription_plan || (subscription?.subscription_plan as SubscriptionPlan | undefined);

    // If already on this plan, do nothing
    if (currentPlan === plan) {
      return;
    }

    // If subscription is set to cancel at period end, block changes until it ends
    if (subscription?.cancel_at_period_end) {
      alert(
        'Your subscription is scheduled to end at the close of this billing period. You can change plans once the current period finishes.'
      );
      return;
    }

    const currentRank = currentPlan ? planOrder.indexOf(currentPlan) : -1;
    const targetRank = planOrder.indexOf(plan);
    const isDowngrade = currentRank !== -1 && targetRank < currentRank;
    const isUpgrade = currentRank !== -1 && targetRank > currentRank;

    // If user has a subscription, they're upgrading/downgrading
    if (currentPlan) {
      if (isDowngrade) {
        alert(
          'Downgrades take effect after your current billing period ends. Please retry after the period closes.'
        );
        return;
      }

      const planName = PLANS.find((p) => p.plan === plan)?.name || 'selected';
      const confirmMessage = isUpgrade
        ? `Switch to ${planName}? This change takes effect immediately and may incur a prorated charge.`
        : `Switch to ${planName}?`;

      if (confirm(confirmMessage)) {
        try {
          setProcessingPlan(plan);
          await apiClient.updateSubscription({ plan });
          alert('Plan updated successfully!');
          router.push('/dashboard/billing');
        } catch (error: any) {
          alert(`Failed to update plan: ${error.message}`);
        } finally {
          setProcessingPlan(null);
        }
      }
    } else {
      // New subscription - redirect to payment method page with plan selection
      router.push(`/dashboard/billing/payment-method?plan=${plan}`);
    }
  };

  const isCurrentPlan = (plan: SubscriptionPlan) => {
    const currentPlan =
      company?.subscription_plan || (subscription?.subscription_plan as SubscriptionPlan | undefined);
    return currentPlan === plan;
  };

  if (loading) {
    return (
      <div className="p-8 max-w-7xl">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="h-96 bg-gray-200 rounded"></div>
            <div className="h-96 bg-gray-200 rounded"></div>
            <div className="h-96 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-up">
      <PageHeader
        eyebrow="Billing"
        title="Choose your plan"
        subtitle="Select the plan that best fits your business needs. The Pro plan includes a 14-day free trial."
      />

      <div className="grid gap-6 md:grid-cols-3 mb-8">
        {PLANS.map((planInfo) => {
          const isCurrent = isCurrentPlan(planInfo.plan);
          const isProcessing = processingPlan === planInfo.plan;

          return (
            <Card
              key={planInfo.plan}
              className={`relative ${
                planInfo.popular
                  ? 'border-blue-500 border-2 shadow-lg'
                  : planInfo.isTopTier
                  ? 'border-emerald-500 border'
                  : ''
              } ${isCurrent ? 'bg-green-50 border-green-500' : ''}`}
            >
              {planInfo.badge && (
                <div className="absolute top-0 right-0 bg-emerald-100 text-emerald-800 px-3 py-1 text-sm font-medium rounded-bl-lg rounded-tr-lg">
                  {planInfo.badge}
                </div>
              )}

              <CardHeader>
                <CardTitle className="text-2xl">{planInfo.name}</CardTitle>
                <CardDescription>{planInfo.description}</CardDescription>
                <div className="mt-4 space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl text-muted-foreground line-through">
                      {planInfo.priceDisplay.original}
                    </span>
                    <span className="text-4xl font-bold">{planInfo.priceDisplay.current}</span>
                    <span className="text-gray-600">{planInfo.priceDisplay.cadence}</span>
                  </div>
                  {planInfo.trialLabel && (
                    <p className="text-xs font-medium text-emerald-700">{planInfo.trialLabel}</p>
                  )}
                </div>
              </CardHeader>

              <CardContent>
                <ul className="space-y-3 mb-6">
                  {planInfo.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <svg
                        className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span className="text-sm text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handleSelectPlan(planInfo.plan)}
                  disabled={isCurrent || isProcessing}
                  className="w-full"
                  variant={isCurrent ? 'outline' : planInfo.popular ? 'default' : 'outline'}
                >
                  {isProcessing
                    ? 'Processing...'
                    : isCurrent
                    ? 'Current Plan'
                    : (company?.subscription_plan || subscription?.subscription_plan)
                    ? 'Switch Plan'
                    : 'Select Plan'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2">All plans include:</h3>
        <ul className="grid md:grid-cols-2 gap-2 text-sm text-blue-800">
          <li className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            AI-powered call handling
          </li>
          <li className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            Call transcription & recording
          </li>
          <li className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            Appointment scheduling
          </li>
          <li className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            Contact management
          </li>
          <li className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            Knowledge base integration
          </li>
          <li className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            Monthly billing cycles
          </li>
        </ul>
      </div>

      <div className="mt-6 text-center">
        <Button variant="ghost" onClick={() => router.push('/dashboard/billing')}>
          Back to Billing
        </Button>
      </div>
    </div>
  );
}

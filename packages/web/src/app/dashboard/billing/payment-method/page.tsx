'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { SubscriptionPlan } from '@handycall/shared';
import { PLAN_CATALOG, getPlanPriceDisplay } from '@/constants/plans';
import { PageHeader } from '@/components/portal/page-header';

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      color: '#32325d',
      fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
      fontSmoothing: 'antialiased',
      fontSize: '16px',
      '::placeholder': {
        color: '#aab7c4',
      },
    },
    invalid: {
      color: '#fa755a',
      iconColor: '#fa755a',
    },
  },
};

function PaymentMethodForm({ selectedPlan }: { selectedPlan?: SubscriptionPlan }) {
  const router = useRouter();
  const { company, checkAuth } = useAuthStore();
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Create setup intent
      const { client_secret } = await apiClient.createSetupIntent();

      // Confirm card setup
      const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(client_secret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (stripeError) {
        throw new Error(stripeError.message);
      }

      if (!setupIntent?.payment_method) {
        throw new Error('No payment method returned from Stripe');
      }

      const paymentMethodId = setupIntent.payment_method as string;

      // If a plan was selected, create subscription
      if (selectedPlan) {
        await apiClient.createSubscription({
          plan: selectedPlan,
          payment_method_id: paymentMethodId,
        });
        setSuccess(true);

        // Refresh company data in auth store
        await checkAuth();

        setTimeout(() => {
          router.push('/dashboard/billing');
        }, 2000);
      } else {
        // Just update payment method
        await apiClient.updatePaymentMethod(paymentMethodId);
        setSuccess(true);

        // Refresh company data in auth store
        await checkAuth();

        setTimeout(() => {
          router.push('/dashboard/billing');
        }, 2000);
      }
    } catch (err: any) {
      const message = err?.message || 'Failed to process payment method';
      if (typeof message === 'string' && message.toLowerCase().includes('not found')) {
        setError('Unable to save the payment method right now. Please try again shortly or contact support so we can enable billing for your account.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Card Information</label>
        <div className="p-4 border border-gray-300 rounded-md">
          <CardElement options={CARD_ELEMENT_OPTIONS} />
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-800">
            {selectedPlan ? 'Subscription created successfully!' : 'Payment method updated successfully!'}
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={!stripe || loading || success} className="flex-1">
          {loading
            ? 'Processing...'
            : selectedPlan
            ? 'Start Subscription'
            : company?.payment_method_last4
            ? 'Update Payment Method'
            : 'Add Payment Method'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/dashboard/billing')}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function PaymentMethodPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { company } = useAuthStore();
  const selectedPlan = searchParams.get('plan') as SubscriptionPlan | null;
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  // Only create the Stripe promise when we actually have a key.
  const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

  const planLabels: Record<SubscriptionPlan, string> = Object.values(SubscriptionPlan).reduce(
    (acc, plan) => {
      const details = PLAN_CATALOG[plan];
      const price = getPlanPriceDisplay(plan);
      const cadence = price.cadence.replace('per ', '');
      acc[plan] = `${details.name} (${price.current}/${cadence})`;
      return acc;
    },
    {} as Record<SubscriptionPlan, string>
  );
  const selectedPlanDetails = selectedPlan ? PLAN_CATALOG[selectedPlan] : undefined;
  const selectedPlanPrice = selectedPlan ? getPlanPriceDisplay(selectedPlan) : undefined;

  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-fade-up">
      <PageHeader
        eyebrow="Billing"
        title="Payment method"
        subtitle={
          selectedPlan
            ? `Add your payment information to start your ${planLabels[selectedPlan]} subscription.`
            : 'Update your payment information.'
        }
      />

      {selectedPlan && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-1">Selected Plan</h3>
          <div className="flex items-baseline gap-2 text-blue-800">
            <span className="text-sm line-through text-blue-700">{selectedPlanPrice?.original}</span>
            <span className="text-lg font-semibold">{selectedPlanPrice?.current}</span>
            <span className="text-sm text-blue-700">{selectedPlanPrice?.cadence}</span>
          </div>
          <p className="text-sm text-blue-700 mt-2">
            {selectedPlanDetails?.trialLabel
              ? `${selectedPlanDetails.trialLabel}. You won't be charged until the trial ends.`
              : 'Your plan will start billing immediately after activation.'}
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {selectedPlan ? 'Payment Information' : 'Update Payment Method'}
          </CardTitle>
          <CardDescription>
            {company?.payment_method_last4
              ? `Current card ending in ${company.payment_method_last4}`
              : 'Enter your card details securely'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!stripePromise ? (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
              Stripe publishable key is not configured. Please set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY and redeploy.
            </div>
          ) : (
            <Elements stripe={stripePromise}>
              <PaymentMethodForm selectedPlan={selectedPlan || undefined} />
            </Elements>
          )}

          <div className="mt-6 p-4 bg-gray-50 rounded-md">
            <div className="flex items-start gap-2">
              <svg
                className="w-5 h-5 text-gray-500 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <div className="text-sm text-gray-600">
                <p className="font-medium mb-1">Secure Payment</p>
                <p>
                  Your payment information is encrypted and securely processed by Stripe. We never
                  store your full card details.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {!selectedPlan && (
        <div className="mt-4 text-sm text-slate-600 text-center">
          You can manage defaults and remove cards from the Billing page.
        </div>
      )}

      {!selectedPlan && (
        <div className="mt-6 text-center">
          <Button variant="ghost" onClick={() => router.push('/dashboard/billing')}>
            Back to Billing
          </Button>
        </div>
      )}
    </div>
  );
}

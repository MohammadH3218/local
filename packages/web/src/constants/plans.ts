import { SubscriptionPlan } from '@handycall/shared';

type PlanLimits = {
  minutes: number;
  sms: number;
  contacts: number;
};

export type PlanCatalogEntry = {
  name: string;
  price: number;
  originalPrice: number;
  cadence: 'month';
  badge?: string;
  trialLabel?: string;
  limits: PlanLimits;
  featureHighlights: string[];
};

export const PLAN_CATALOG: Record<SubscriptionPlan, PlanCatalogEntry> = {
  [SubscriptionPlan.STARTER]: {
    name: 'Starter',
    price: 19.99,
    originalPrice: 29.99,
    cadence: 'month',
    badge: 'Great for solo operators',
    limits: { minutes: 100, sms: 200, contacts: 300 },
    featureHighlights: [
      '100 minutes/month',
      '200 SMS/month',
      '300 contacts',
      'AI receptionist with brand voice',
      'Smart appointment booking',
      'Lead capture & qualification',
      'Automated SMS confirmations',
      'Spam & robocall filtering',
      'Call recording (7-day retention)',
      'Usage dashboard',
    ],
  },
  [SubscriptionPlan.PRO]: {
    name: 'Pro',
    price: 39.99,
    originalPrice: 49.99,
    cadence: 'month',
    badge: 'Most popular',
    trialLabel: 'Free trial — 14 days',
    limits: { minutes: 300, sms: 600, contacts: 1000 },
    featureHighlights: [
      '300 minutes/month',
      '600 SMS/month',
      '1,000 contacts',
      'Everything in Starter, plus:',
      'Call summaries & transcripts',
      'After-hours routing',
      'Human transfer to your phone',
      'Smart follow-up sequences',
      'Call recording (30-day retention)',
      'Priority support',
    ],
  },
  [SubscriptionPlan.MAX]: {
    name: 'Max',
    price: 99.99,
    originalPrice: 149.99,
    cadence: 'month',
    badge: 'Best value for teams',
    limits: { minutes: 750, sms: 1500, contacts: 3000 },
    featureHighlights: [
      '750 minutes/month',
      '1,500 SMS/month',
      '3,000 contacts',
      'Everything in Pro, plus:',
      'CRM integrations (Zapier, webhooks)',
      'Advanced routing (overflow + multi-location)',
      'Website chat widget',
      'Call recording (90-day retention)',
      'Priority phone support',
    ],
  },
};

export function formatUsd(amount: number) {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

export function getPlanPriceDisplay(plan: SubscriptionPlan) {
  const details = PLAN_CATALOG[plan];
  return {
    current: formatUsd(details.price),
    original: formatUsd(details.originalPrice),
    cadence: `per ${details.cadence}`,
  };
}

export function normalizePlan(plan?: string | SubscriptionPlan | null): SubscriptionPlan | undefined {
  if (!plan) return undefined;
  const upper = String(plan).toUpperCase();
  if (upper in PLAN_CATALOG) {
    return upper as SubscriptionPlan;
  }
  return undefined;
}
